import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { RequestBudget } from './request-budget.js';

const validator = new AjvJsonSchemaValidator();

/** Keep the resolved application and risk visible at the DSH approval boundary. */
export function formatApprovalReason(params) {
  const meta = params._meta;
  const app = meta?.connector_id === 'computer-use' ? meta.tool_params?.app : undefined;
  return [
    'CUA MCP confirmation:', params.message,
    ...(typeof app === 'string' ? [`Application: ${app}`] : []),
    ...(typeof app === 'string' && typeof meta.riskLevel === 'string' ? [`Risk: ${meta.riskLevel}`] : []),
    ...(typeof app === 'string' && typeof meta.subtitle === 'string' ? [meta.subtitle] : []),
  ].join('\n');
}

/** DSH's approval UI can answer confirmations, but cannot supply arbitrary form values. */
export async function confirmElicitation(params, active, approve, signal) {
  if (!active || signal.aborted || params.mode === 'url') return { action: 'cancel' };
  const schema = params.requestedSchema;
  if (!schema || schema.type !== 'object' || !schema.properties || Object.keys(schema.properties).length) return { action: 'cancel' };
  try {
    if (!validator.getValidator(schema)({}).valid) return { action: 'cancel' };
  } catch { return { action: 'cancel' }; }
  const outcome = await approve(params, active, signal);
  if (signal.aborted) return { action: 'cancel' };
  if (outcome === 'allowed-once') return { action: 'accept', content: {} };
  return { action: outcome === 'rejected' ? 'decline' : 'cancel' };
}

/** One MCP process per DSH agent. JS bindings survive turns, never cross chats. */
export class CuaConnection {
  constructor(parameters, options = {}) {
    this.options = { requestTimeoutMs: 90000, approvalTimeoutMs: 300000, defaultJsTimeoutMs: 60000, ...options };
    this.sessionId = randomUUID();
    // Browser preferences are scoped at runtime startup. Wire metadata must
    // name the same session whose preference file the launcher authorized.
    this.parameters = { ...parameters, env: { ...parameters.env, CUA_MCP_SESSION_ID: this.sessionId } };
    this.tail = Promise.resolve();
    this.lifetime = new AbortController();
    this.closed = false;
  }

  enqueue(work) {
    const result = this.tail.then(work);
    this.tail = result.catch(() => {});
    return result;
  }

  async connect() {
    if (this.closed) throw new Error('CUA connection is closed; the next call needs a new runtime');
    if (this.client) return;
    const client = new Client({ name: 'dsh-cua-kit', version: '0.1.0' }, {
      capabilities: this.options.approve ? { elicitation: { form: {} } } : {},
    });
    const transport = new StdioClientTransport(this.parameters);
    this.client = client;
    if (this.options.approve) client.setRequestHandler(ElicitRequestSchema, (request, extra) =>
      confirmElicitation(request.params, this.active,
        (...args) => this.budget ? this.budget.approve(() => this.options.approve(...args)) : 'cancelled',
        AbortSignal.any([extra.signal, this.lifetime.signal, ...(this.active ? [this.active.signal] : []), ...(this.budget ? [this.budget.signal] : [])])));
    try {
      await client.connect(transport, { timeout: this.options.requestTimeoutMs, signal: this.lifetime.signal });
      const tools = [];
      let cursor;
      do {
        const page = await client.listTools({ cursor }, { timeout: this.options.requestTimeoutMs, signal: this.lifetime.signal });
        tools.push(...page.tools);
        cursor = page.nextCursor;
      } while (cursor);
      if (!tools.some(tool => tool.name === 'js') || !tools.some(tool => tool.name === 'turn_ended')) {
        throw new Error('CUA requires the restored MCP server exposing js and turn_ended');
      }
      this.tools = tools.filter(tool => tool.name !== 'turn_ended');
      this.instructions = client.getInstructions() ?? '';
      if (this.options.catalog && !isDeepStrictEqual(this.tools, this.options.catalog)) {
        throw new Error('CUA tool catalog changed; reload the DSH plugin before executing');
      }
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  call(name, args, exec, turn) {
    return this.enqueue(async () => {
      exec.signal.throwIfAborted();
      if (this.blocked && this.turn === turn) throw new Error('CUA browser policy blocked this turn; no further actions are permitted in this turn');
      // Cancellation during startup must terminate the newly spawned process too.
      const abort = () => { void this.close().catch(() => {}); };
      exec.signal.addEventListener('abort', abort, { once: true });
      try {
        await this.connect();
        exec.signal.throwIfAborted();
        if (name === 'turn_ended' || !this.tools.some(tool => tool.name === name)) throw new Error('Unknown CUA tool');
        if (this.turn !== undefined && this.turn !== turn) await this.finishTurn();
        this.turn = turn;
        this.active = exec;
        let arguments_ = args;
        if (name === 'js' && Object.hasOwn(args, 'code') && !Object.hasOwn(args, 'completion_summary') && args.timeout_ms === undefined) {
          arguments_ = { ...args, timeout_ms: this.options.defaultJsTimeoutMs };
        }
        this.budget = new RequestBudget(this.options.requestTimeoutMs, this.options.approvalTimeoutMs);
        const result = await this.client.callTool({ name, arguments: arguments_, _meta: this.metadata() }, undefined, {
          signal: AbortSignal.any([exec.signal, this.lifetime.signal, this.budget.signal]),
          timeout: this.options.requestTimeoutMs + this.options.approvalTimeoutMs,
        });
        if (result.isError && result.content?.some(item => item.type === 'text' && (
          item.text.startsWith('Browser Use rejected this action due to browser security policy. Reason:') ||
          item.text.startsWith('Browser Use could not complete this action because a browser security check was unavailable. Reason:')
        ))) this.blocked = true;
        return result;
      } catch (error) {
        // Never replay an action. A failed/aborted transport gets discarded.
        await this.close();
        throw error;
      } finally {
        this.budget?.dispose();
        this.budget = undefined;
        exec.signal.removeEventListener('abort', abort);
        this.active = undefined;
      }
    });
  }

  metadata() {
    return { 'x-codex-turn-metadata': { session_id: this.sessionId, turn_id: `${this.sessionId}-${this.turn}` } };
  }

  async finishTurn() {
    if (this.turn === undefined || this.closed) return;
    try {
      const result = await this.client.callTool({
        name: 'turn_ended',
        arguments: { hook_event_name: 'turn_ended', session_id: this.sessionId, turn_id: `${this.sessionId}-${this.turn}` },
        _meta: this.metadata(),
      }, undefined, { timeout: this.options.requestTimeoutMs });
      if (result.isError) throw new Error('CUA turn_ended cleanup failed');
      this.turn = undefined;
      this.blocked = false;
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  endTurn(turn) {
    return this.enqueue(() => this.turn === turn ? this.finishTurn() : undefined);
  }

  async dispose() {
    try {
      if (!this.active && this.turn !== undefined && !this.closed) await this.endTurn(this.turn);
    } finally { await this.close(); }
  }

  close() {
    if (!this.closing) {
      this.closed = true;
      this.lifetime.abort();
      this.closing = Promise.resolve().then(() => this.client?.close());
    }
    return this.closing;
  }
}

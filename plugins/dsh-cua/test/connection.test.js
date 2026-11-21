import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client';
import { Config, serverParameters } from '../src/config.js';
import { CuaConnection, confirmElicitation } from '../src/connection.js';

const parameters = { command: process.execPath, args: [fileURLToPath(new URL('./fixture-server.js', import.meta.url))], stderr: 'inherit' };
const execution = signal => ({ signal: signal ?? new AbortController().signal, agent: { id: 'agent-1' }, callId: 'call-1', name: 'cua_js' });
const readText = result => result.content.filter(item => item.type === 'text').map(item => item.text).join('\n');

test('runtime startup and wire metadata use the same isolated session identity', async t => {
  const configured = { ...parameters, env: { CUA_MCP_SESSION_ID: 'ambient-session' } };
  const a = new CuaConnection(configured), b = new CuaConnection(configured);
  t.after(() => Promise.all([a.dispose(), b.dispose()]));
  for (const connection of [a, b]) {
    const result = await connection.call('js', { code: 'session-config' }, execution(), 1);
    assert.notEqual(result.isError, true);
    assert.equal(readText(result), connection.sessionId);
  }
  assert.notEqual(a.sessionId, b.sessionId);
  assert.equal(configured.env.CUA_MCP_SESSION_ID, 'ambient-session');
});

test('discovers tools, forwards metadata, preserves summary branch, serializes calls and ends each turn once', async t => {
  const connection = new CuaConnection(parameters);
  t.after(() => connection.close());
  await connection.connect();
  assert.equal(connection.instructions, 'Fixture CUA server instructions');
  assert.deepEqual(connection.tools.map(tool => tool.name), ['js', 'js_reset']);
  await Promise.all([
    connection.call('js', { code: '1' }, execution(), 1),
    connection.call('js', { completion_summary: 'Checked fixture' }, execution(), 1),
  ]);
  await Promise.all([connection.endTurn(1), connection.endTurn(1)]);
  await connection.call('js', { code: '2' }, execution(), 2);
  const calls = JSON.parse(readText(await connection.call('js', { code: 'log' }, execution(), 2)));
  assert.equal(calls.filter(call => call.name === 'turn_ended').length, 1);
  assert.deepEqual(calls[1].args, { completion_summary: 'Checked fixture' });
  assert.equal(calls[0].args.timeout_ms, 60000);
  assert.ok(calls.every(call => !call.overlap));
  const first = calls[0].meta['x-codex-turn-metadata'];
  assert.equal(calls[2].args.session_id, first.session_id);
  assert.equal(calls[2].args.turn_id, first.turn_id);
  assert.notEqual(calls[3].meta['x-codex-turn-metadata'].turn_id, first.turn_id);
  await assert.rejects(connection.call('turn_ended', {}, execution(), 2), /Unknown CUA tool/);
});

test('separate agents do not share runtimes and unclosed turns are cleaned before switching', async t => {
  const a = new CuaConnection(parameters), b = new CuaConnection(parameters);
  t.after(() => Promise.all([a.close(), b.close()]));
  await a.call('js', { code: 'a' }, execution(), 1);
  await a.call('js', { code: 'b' }, execution(), 2);
  await b.call('js', { code: 'c' }, execution(), 1);
  const logA = JSON.parse(readText(await a.call('js', { code: 'log' }, execution(), 2)));
  const logB = JSON.parse(readText(await b.call('js', { code: 'log' }, execution(), 1)));
  assert.deepEqual(logA.map(call => call.name), ['js', 'turn_ended', 'js']);
  assert.equal(logB.length, 1);
  assert.notEqual(a.sessionId, b.sessionId);
});

test('real MCP elicitation reaches host approval with caller identity', async t => {
  const exec = execution();
  const connection = new CuaConnection(parameters, { approve: async (params, active) => {
    assert.equal(active, exec);
    assert.match(params.message, /example.com/);
    return 'allowed-once';
  } });
  t.after(() => connection.close());
  const result = await connection.call('js', { code: 'approve' }, exec, 1);
  assert.deepEqual(JSON.parse(readText(result)), { action: 'accept', content: {} });
});

test('elicitation cancels unsupported forms and maps denial without automatic acceptance', async () => {
  const params = { message: 'confirm', requestedSchema: { type: 'object', properties: {} } };
  const signal = new AbortController().signal;
  for (const [outcome, action] of [['rejected', 'decline'], ['cancelled', 'cancel'], ['unavailable', 'cancel']]) {
    assert.deepEqual(await confirmElicitation(params, execution(), async () => outcome, signal), { action });
  }
  const unexpected = () => assert.fail('unsupported request must not be approved');
  for (const value of [
    { mode: 'url', message: 'open login', url: 'https://example.com' },
    { ...params, requestedSchema: { type: 'object', properties: { password: { type: 'string' } } } },
    { ...params, requestedSchema: { type: 'object', properties: {}, required: ['missing'] } },
  ]) assert.deepEqual(await confirmElicitation(value, execution(), unexpected, signal), { action: 'cancel' });
  assert.deepEqual(await confirmElicitation(params, undefined, unexpected, signal), { action: 'cancel' });
});

test('human approval time is separate from the MCP execution deadline', async t => {
  let approvals = 0;
  const connection = new CuaConnection(parameters, {
    requestTimeoutMs: 2000, approvalTimeoutMs: 2000,
    approve: async () => { approvals++; await new Promise(resolve => setTimeout(resolve, 300)); return 'allowed-once'; },
  });
  t.after(() => connection.close());
  await connection.connect();
  connection.options.requestTimeoutMs = 150;
  const result = await connection.call('js', { code: 'approve-twice' }, execution(), 1);
  assert.equal(approvals, 2);
  assert.deepEqual(JSON.parse(readText(result)), { action: 'accept', content: {} });
  assert.equal(connection.closed, false);
});

test('a request without approval retains its execution timeout', async t => {
  const connection = new CuaConnection(parameters, { requestTimeoutMs: 2000, approvalTimeoutMs: 10000 });
  t.after(() => connection.close());
  await connection.connect();
  connection.options.requestTimeoutMs = 100;
  await assert.rejects(connection.call('js', { code: 'wait' }, execution(), 1), /execution timed out/);
  assert.equal(connection.closed, true);
});

test('approval expiry and user cancellation abort the pending approval', async t => {
  for (const cancel of [false, true]) {
    let entered;
    const ready = new Promise(resolve => { entered = resolve; });
    let approvalAborted = false;
    const connection = new CuaConnection(parameters, {
      requestTimeoutMs: 2000, approvalTimeoutMs: 150,
      approve: async (_params, _active, signal) => {
        entered();
        await new Promise(resolve => signal.addEventListener('abort', () => { approvalAborted = true; resolve(); }, { once: true }));
        return 'cancelled';
      },
    });
    t.after(() => connection.close());
    await connection.connect();
    const controller = new AbortController();
    const pending = connection.call('js', { code: 'approve' }, execution(controller.signal), 1);
    const rejected = assert.rejects(pending, cancel ? /abort|closed/i : /approval.*timed out/i);
    await ready;
    if (cancel) controller.abort();
    await rejected;
    assert.equal(approvalAborted, true);
    assert.equal(connection.closed, true);
  }
});

test('cancellation closes runtime and never replays actions', async t => {
  const connection = new CuaConnection(parameters);
  t.after(() => connection.close());
  await connection.connect();
  const controller = new AbortController();
  const pending = connection.call('js', { code: 'wait' }, execution(controller.signal), 1);
  const timer = setTimeout(() => controller.abort(), 100);
  t.after(() => clearTimeout(timer));
  await assert.rejects(pending);
  assert.equal(connection.closed, true);
  await assert.rejects(connection.call('js', { code: 'x' }, execution(), 1), /closed/);
});

test('browser policy stops subsequent same-turn calls without opening another runtime', async t => {
  const connection = new CuaConnection(parameters);
  t.after(() => connection.close());
  assert.equal((await connection.call('js', { code: 'policy' }, execution(), 1)).isError, true);
  await assert.rejects(connection.call('js', { code: 'x' }, execution(), 1), /policy blocked/);
  assert.equal(connection.closed, false);
  await connection.endTurn(1);
  assert.equal(readText(await connection.call('js', { code: 'x' }, execution(), 2)), 'ok');
});

test('DSH official adapter records MCP errors and retains raw screenshot content', async t => {
  const connection = new CuaConnection(parameters);
  t.after(() => connection.close());
  const definition = createMcpToolDefinition({ get: () => undefined }, {
    name: 'cua_js', rawName: 'js', description: 'fixture', inputSchema: { type: 'object' },
    call: (args, exec) => connection.call('js', args, exec, 1),
  });
  await assert.rejects(definition.execute({ code: 'error' }, execution()), /fixture failure/);
  const exec = execution();
  const value = await definition.execute({ code: 'image' }, exec);
  assert.deepEqual(value.content, [{ type: 'image', mimeType: 'image/png', data: 'aW1hZ2U=' }]);
  const fallback = definition.output.render({}, value);
  const projected = definition.projectContent(exec, { value, content: fallback, isError: false });
  assert.match(readText({ content: projected }), /image unavailable/);
});

test('server configuration excludes DSH credentials and inherited runtime policy', async () => {
  const config = Config({ surfaces: 'computer' });
  const parameters = await serverParameters(config, {
    HOME: '/tmp/fixture', PATH: process.env.PATH,
    DEEPSEEK_API_KEY: 'fixture-key', OPENAI_API_KEY: 'fixture-other-key',
    NODE_OPTIONS: '--inspect', CORE_CUA_APP_POLICY: 'ambient-policy',
  });
  assert.equal(parameters.env.DEEPSEEK_API_KEY, undefined);
  assert.equal(parameters.env.OPENAI_API_KEY, undefined);
  assert.equal(parameters.env.NODE_OPTIONS, undefined);
  assert.equal(parameters.env.CORE_CUA_APP_POLICY, undefined);
  assert.equal(JSON.parse(parameters.env.CUA_MCP_ENV).CUA_REPL_ENABLED_SURFACES, 'computer');
  await assert.rejects(serverParameters({ ...config, runtimeEnvironment: { DEEPSEEK_API_KEY: 'fixture' } }), /credentials/);
});

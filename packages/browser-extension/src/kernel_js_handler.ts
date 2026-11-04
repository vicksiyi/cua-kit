import {
  KernelSessionLifecycle,
  kernelTurnCleanupMetadata,
  type KernelSessionLifecycleHost,
  type KernelTurnMetadata,
} from "./kernel_session_lifecycle";
import type { KernelOutput } from "./kernel_scope";
const controlAllowedKey = "browserUseControlAllowed";
const controlElicitationId = "browser-use-first-time-control";
/** Original pt and Zg. Protocol keys are kept verbatim. */
export function kernelBrowserOutcome(reason: string) {
  return { "openai/browser_outcome": { reason } };
}
export function kernelSessionMetadataId(metadata?: KernelTurnMetadata | null) {
  if (
    metadata?.thread_source === "subagent" &&
    typeof metadata.thread_id === "string"
  )
    return metadata.thread_id;
  return typeof metadata?.session_id === "string"
    ? metadata.session_id
    : undefined;
}
export interface KernelJsClient {
  createElicitation(
    request: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<{ action: string }>;
}
export interface KernelJsContext {
  scopeId?: string | null;
  channel: string;
  requestMeta: Record<string, any>;
  turnMetadata?: KernelTurnMetadata | null;
}
export interface KernelJsHandlerHost<Pdf> extends Omit<
  KernelSessionLifecycleHost<Pdf>,
  "errorMetadata"
> {
  storage: {
    get(key: string): Promise<Record<string, unknown>>;
    set(values: Record<string, unknown>): Promise<unknown>;
  };
  browserShortDisplayName(): string;
  activity?: { turnStarted(key: string): void; turnEnded(key: string): void };
  beginScope(
    id: string,
    client: KernelJsClient,
    signal: AbortSignal,
    chatApi: KernelSessionLifecycleHost<Pdf>["chatApi"],
    onPdf: (pdf: Pdf) => void,
  ): { content: KernelOutput[]; dispose(): void };
  getKernel(
    id: string,
    signal: AbortSignal,
  ): Promise<{
    executeJs(
      code: string,
      signal: AbortSignal,
      metadata: Record<string, unknown>,
    ): Promise<{
      contentItems: unknown[];
      responseMeta?: Record<string, unknown>;
      error?: { name: string; message: string };
      resetRequired?: boolean;
    }>;
  }>;
}
/** Original p_.handleJsCall composed with the same p_ lifecycle. Service
 * dependencies must be bound by the tunnel host; this does not grant consent. */
export class KernelJsHandler<Pdf> extends KernelSessionLifecycle<Pdf> {
  constructor(private readonly executionHost: KernelJsHandlerHost<Pdf>) {
    super({ ...executionHost, errorMetadata: kernelBrowserOutcome });
  }
  async handleJsCall(
    input: { code: string; instance_id: string },
    client: KernelJsClient,
    signal: AbortSignal,
    context: KernelJsContext,
  ) {
    const scopeId = context.scopeId;
    if (scopeId == null)
      return {
        _meta: kernelBrowserOutcome("invalid_turn_metadata"),
        content: [
          {
            text: "JavaScript execution requires thread-scoped Codex metadata",
            type: "text",
          },
        ],
        isError: true,
      };
    const scopes =
      this.scopeIdsByChannel.get(context.channel) ?? new Set<string>();
    this.scopeIdsByChannel.set(context.channel, scopes);
    scopes.add(scopeId);
    const metadata = context.requestMeta["x-codex-turn-metadata"];
    const turn = JSON.stringify([
      scopeId,
      kernelSessionMetadataId(metadata),
      metadata?.turn_id,
    ]);
    const host = this.executionHost;
    host.activity?.turnStarted(this.activityKey(turn));
    const controller = new AbortController();
    this.jsCalls.set(controller, turn);
    signal = AbortSignal.any([signal, host.chatApi.signal, controller.signal]);
    return await this.runInScope(scopeId, signal, async () => {
      signal.throwIfAborted();
      const scope = host.beginScope(
        this.kernelScopeId(scopeId),
        client,
        signal,
        host.chatApi,
        (pdf) => {
          const cleanup = kernelTurnCleanupMetadata(context.turnMetadata);
          const key = JSON.stringify([
            scopeId,
            cleanup.session_id,
            cleanup.turn_id,
          ]);
          const uploads = this.pdfUploadsByTurn.get(key) ?? new Set<Pdf>();
          uploads.add(pdf);
          this.pdfUploadsByTurn.set(key, uploads);
        },
      );
      try {
        const settings = await host.storage.get(controlAllowedKey);
        signal.throwIfAborted();
        if (settings.browserUseControlAllowed !== true) {
          const browserName = host.browserShortDisplayName();
          const browserContext = context.requestMeta["openai/browser_context"];
          if (
            typeof browserContext === "object" &&
            browserContext != null &&
            !Array.isArray(browserContext) &&
            browserContext.mode === "chat"
          ) {
            let challenge = this.browserControlChallenges.get(scopeId);
            if (challenge?.instanceId !== input.instance_id)
              challenge = undefined;
            if (
              challenge == null ||
              browserContext.browser_control_consent !== challenge.challenge
            ) {
              challenge ??= {
                challenge: host.randomUUID(),
                instanceId: input.instance_id,
              };
              this.browserControlChallenges.set(scopeId, challenge);
              return {
                _meta: {
                  ...kernelBrowserOutcome("none"),
                  "openai/browser_control_consent": {
                    elicitation_id: controlElicitationId,
                    challenge: challenge.challenge,
                    browser_name: browserName,
                  },
                },
                content: [
                  {
                    type: "text",
                    text: "Browser control requires your permission.",
                  },
                ],
                isError: false,
              };
            }
            this.browserControlChallenges.delete(scopeId);
          } else {
            const result = await client.createElicitation(
              {
                message:
                  "ChatGPT can read your open tabs and take actions in them to help complete your tasks.",
                requestedSchema: {
                  additionalProperties: false,
                  properties: {},
                  type: "object",
                },
                _meta: {
                  codex_requires_user_input: true,
                  codex_guardian_compatible: false,
                  browser_use_elicitation_id: controlElicitationId,
                  browser_use_browser_name: browserName,
                  codex_approval_kind: "mcp_tool_call",
                  connector_id: "browser-use",
                  connector_name: "Browser",
                  tool_name: "allow_browser_control",
                  tool_title: `Allow ChatGPT to use your ${browserName}?`,
                  tool_params: {},
                  tool_params_display: [],
                },
              },
              signal,
            );
            signal.throwIfAborted();
            if (result.action !== "accept")
              return {
                _meta: kernelBrowserOutcome("control_permission_denied"),
                content: [
                  { text: "Browser control was not allowed.", type: "text" },
                ],
                isError: true,
              };
          }
          await host.storage.set({ [controlAllowedKey]: true });
          signal.throwIfAborted();
        }
        this.browserControlChallenges.clear();
        const execution = await (
          await host.getKernel(this.kernelScopeId(scopeId), signal)
        ).executeJs(input.code, signal, context.requestMeta);
        const result: {
          content: unknown[];
          isError?: boolean;
          _meta?: Record<string, unknown>;
        } = { content: [...scope.content] };
        if (execution.error != null) {
          result.content.push({
            text: `${execution.error.name}: ${execution.error.message}`,
            type: "text",
          });
          result.isError = true;
        }
        for (const item of execution.contentItems)
          result.content.push({ text: item, type: "text" });
        result._meta = {
          ...execution.responseMeta,
          ...kernelBrowserOutcome(
            execution.error == null
              ? "none"
              : execution.resetRequired
                ? "kernel_reset"
                : "unclassified_tool_error",
          ),
        };
        return result;
      } catch (error) {
        if (signal.aborted) throw error;
        return {
          _meta: kernelBrowserOutcome("extension_runtime_error"),
          content: [
            ...scope.content,
            {
              text:
                error instanceof Error
                  ? `${error.name}: ${error.message}`
                  : "JavaScript execution failed",
              type: "text",
            },
          ],
          isError: true,
        };
      } finally {
        scope.dispose();
      }
    }).finally(() => {
      this.jsCalls.delete(controller);
    });
  }
}

/** Original p_.shouldDeferCommand, applied before tunnel dispatch. */
export function shouldDeferKernelCommand(command: { jsonrpc?: any }) {
  const rpc = command.jsonrpc;
  return (
    rpc != null &&
    "method" in rpc &&
    rpc.method === "tools/call" &&
    typeof rpc.params === "object" &&
    rpc.params != null &&
    "name" in rpc.params &&
    (rpc.params.name === "js" || rpc.params.name === "turn_ended")
  );
}
/** Original p_ constructor tool registration. The transport supplies the
 * validated context and elicitation client; no model-specific dependency. */
export function registerKernelSessionTools<Pdf>(
  handler: KernelJsHandler<Pdf>,
  server: {
    registerTool(
      name: string,
      schema: Record<string, unknown>,
      run: (
        input: any,
        client: KernelJsClient,
        signal: AbortSignal,
        context: KernelJsContext,
      ) => Promise<unknown>,
    ): void;
  },
) {
  server.registerTool(
    "js",
    {
      description: "Execute JavaScript in the selected browser instance.",
      inputSchema: {
        additionalProperties: false,
        properties: {
          code: { type: "string" },
          instance_id: { type: "string" },
        },
        required: ["code", "instance_id"],
        type: "object",
      },
    },
    (input, client, signal, context) =>
      handler.handleJsCall(input, client, signal, context),
  );
  server.registerTool(
    "turn_ended",
    {
      _meta: { ui: { visibility: ["app"] } },
      description: "Release browser control after a completed turn.",
      inputSchema: {
        additionalProperties: false,
        properties: {},
        type: "object",
      },
    },
    (_input, _client, signal, context) => handler.turnEnded(signal, context),
  );
}

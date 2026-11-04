import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  KernelJsHandler,
  registerKernelSessionTools,
  shouldDeferKernelCommand,
} from "../packages/browser-extension/src/kernel_js_handler";
import { createKernelScopeRegistry } from "../packages/browser-extension/src/kernel_scope";

async function scenario(original: boolean, mode: string) {
  const trace: unknown[] = [];
  let sequence = 0;
  let allowed = ["allowed", "error", "reset", "throw", "abort"].includes(mode);
  const abort = new AbortController();
  const chatApi = {
    account: { userId: "u", id: "a" },
    signal: new AbortController().signal,
    dispose() {},
  };
  const registry = createKernelScopeRegistry<any, typeof chatApi, string>();
  let scopeId: string | undefined;
  const beginScope = (
    id: string,
    client: any,
    signal: AbortSignal,
    api: typeof chatApi,
    onPdf: (pdf: string) => void,
  ) => {
    trace.push(["begin", id]);
    scopeId = id;
    const scope = registry.begin(id, client, signal, api, onPdf);
    return {
      ...scope,
      dispose() {
        trace.push("dispose");
        scope.dispose();
      },
    };
  };
  const storage = {
    async get(key: string) {
      trace.push(["get", key]);
      if (mode === "abort") abort.abort(Error("cancelled"));
      return { browserUseControlAllowed: allowed };
    },
    async set(value: any) {
      trace.push(["set", value]);
      allowed = value.browserUseControlAllowed;
    },
  };
  const getKernel = async (id: string, signal: AbortSignal) => {
    trace.push(["kernel", id, signal.aborted]);
    return {
      async executeJs(code: string, _signal: AbortSignal, metadata: unknown) {
        trace.push(["execute", code, metadata]);
        registry.get(id).content.push({ type: "text", text: "displayed" });
        registry.get(id).onPdfUploaded?.("pdf");
        if (mode === "throw") throw Error("host failed");
        return {
          contentItems: ["runtime output"],
          responseMeta: {
            custom: 1,
            "openai/browser_outcome": { reason: "must-be-overwritten" },
          },
          ...(["error", "reset"].includes(mode)
            ? {
                error: { name: "TypeError", message: "bad code" },
                resetRequired: mode === "reset",
              }
            : {}),
        };
      },
    };
  };
  const randomUUID = () => `id-${++sequence}`;
  const activity = {
    turnStarted(key: string) {
      trace.push(["start", key]);
    },
    turnEnded() {},
  };
  let handler: any;
  const tools = new Map<string, Function>();
  const registerTool = (name: string, schema: unknown, run: Function) => {
    trace.push(["tool", name, schema]);
    tools.set(name, run);
  };
  if (original) {
    class Base {
      registerTool = registerTool;
      dispose() {}
    }
    const { p_ } = extensionBindings(["Pl", "pt", "Zg", "p_"], {
      d_: Base,
      crypto: { randomUUID },
      Yc: class {
        constructor() {
          return chatApi;
        }
      },
      Hg: beginScope,
      Yg: getKernel,
      chrome: { storage: { sync: storage } },
      qs: "browserUseControlAllowed",
      Ol: "browser-use-first-time-control",
      Fn: async (_api: unknown, pdf: string) => {
        trace.push(["delete-pdf", pdf]);
      },
      Ue: { chrome: { shortDisplayName: "Chrome" } },
      os: () => "chrome",
      navigator: {},
    });
    handler = new p_({}, async () => {}, undefined, undefined, activity);
  } else {
    handler = new KernelJsHandler({
      chatApi,
      randomUUID,
      disposeTransport() {},
      resetKernel: async () => {},
      onTurnEnded: async () => {},
      deletePdf: async (pdf: string) => {
        trace.push(["delete-pdf", pdf]);
      },
      warn() {},
      activity,
      storage,
      browserShortDisplayName: () => "Chrome",
      beginScope,
      getKernel,
    });
  }
  if (!original) registerKernelSessionTools(handler, { registerTool });
  for (const command of [
    {},
    { jsonrpc: { method: "tools/call", params: { name: "js" } } },
    { jsonrpc: { method: "tools/call", params: { name: "turn_ended" } } },
    { jsonrpc: { method: "tools/list" } },
    { jsonrpc: { method: "tools/call", params: { name: "other" } } },
  ]) {
    trace.push([
      "defer",
      original
        ? handler.shouldDeferCommand(command)
        : shouldDeferKernelCommand(command),
    ]);
  }
  const client = {
    async createElicitation(request: unknown, signal: AbortSignal) {
      trace.push(["elicit", request, signal.aborted]);
      return { action: mode === "denied" ? "decline" : "accept" };
    },
  };
  const turnMetadata = { session_id: "session", turn_id: "turn" };
  const requestMeta: Record<string, any> = {
    "x-codex-turn-metadata": turnMetadata,
  };
  if (mode === "chat") requestMeta["openai/browser_context"] = { mode: "chat" };
  const context = {
    scopeId: mode === "invalid" ? undefined : "scope",
    channel: "main",
    requestMeta,
    turnMetadata,
  };
  async function call(instance = "instance") {
    try {
      trace.push([
        "result",
        await tools.get("js")!(
          { code: "1+1", instance_id: instance },
          client,
          abort.signal,
          context,
        ),
      ]);
    } catch (error) {
      trace.push(["throw", (error as Error).message]);
    }
    assert.equal(handler.jsCalls.size, 0);
    assert.equal(handler.scopeOperations.size, 0);
    if (scopeId) assert.throws(() => registry.get(scopeId!), /not executing/);
  }
  await call();
  if (mode === "chat") {
    await call(); // same instance reuses pending challenge
    const old = handler.browserControlChallenges.get("scope").challenge;
    requestMeta["openai/browser_context"].browser_control_consent = old;
    await call("other-instance"); // stale instance cannot grant consent
    requestMeta["openai/browser_context"].browser_control_consent =
      handler.browserControlChallenges.get("scope").challenge;
    await call("other-instance"); // matching explicit challenge is accepted
  }
  if (!["invalid", "abort"].includes(mode)) {
    trace.push([
      "turn-ended",
      await tools.get("turn_ended")!({}, client, abort.signal, context),
    ]);
    assert.equal(handler.pdfUploadsByTurn.size, 0);
  }
  trace.push(["pending-challenges", [...handler.browserControlChallenges]]);
  trace.push([
    "pdfs",
    [...handler.pdfUploadsByTurn].map(([key, values]: any) => [
      key,
      [...values],
    ]),
  ]);
  return trace;
}

test("JS execution and consent handler matches installed original across permission and failure paths", async () => {
  for (const mode of [
    "invalid",
    "allowed",
    "accept",
    "denied",
    "chat",
    "error",
    "reset",
    "throw",
    "abort",
  ]) {
    assert.deepEqual(
      await scenario(false, mode),
      await scenario(true, mode),
      mode,
    );
  }
});

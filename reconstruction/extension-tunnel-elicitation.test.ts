import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  TunnelElicitationClient,
  isTunnelElicitationResult,
  tunnelSessionHeaders,
} from "../packages/browser-extension/src/tunnel_elicitation_client";
const {
  r_: Original,
  Rl,
  n_: valid,
} = extensionBindings(["r_", "Rl", "n_"], {
  crypto: { randomUUID: () => "elicitation" },
});
const command = {
  channel: "main",
  request_id: "request",
  headers: { "Mcp-Session-Id": ["session"] },
  jsonrpc: { id: 7, method: "tools/call" },
};
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test("elicitation reply guards and session binding match original", () => {
  const headers = [
    undefined,
    {},
    { "Mcp-Session-Id": ["s"] },
    { "mcp-session-id": "s" },
    { "Mcp-Session-Id": [""] },
    { "Mcp-Session-Id": ["s", "s"] },
    { "Mcp-Session-Id": ["s"], "mcp-session-id": ["s"] },
  ];
  for (const own of headers)
    for (const incoming of headers)
      for (const channel of [undefined, "main", "other"]) {
        const init = { headers: own };
        const event = { headers: incoming, channel };
        const original = new Original(
          init,
          () => {},
          () => {},
          () => {},
        );
        const restored = new TunnelElicitationClient(
          init,
          async () => true,
          async () => {},
          () => {},
        );
        assert.deepEqual(tunnelSessionHeaders(init), Rl(init));
        assert.equal(
          restored.matchesSession(event),
          original.matchesSession(event),
        );
      }
  for (const value of [
    undefined,
    null,
    {},
    [],
    { action: "accept" },
    { action: "cancel" },
    { action: "decline" },
    { action: "other" },
    Object.create({ action: "accept" }),
  ])
    assert.equal(isTunnelElicitationResult(value), valid(value));
});

test("elicitation delivery, acknowledgement, races and cancellation match original", async () => {
  for (const mode of [
    "accept",
    "decline",
    "invalid",
    "remote-error",
    "unacknowledged",
    "delivery-false",
    "delivery-error",
    "poll-error",
    "early-response",
    "dispose-before-delivery",
    "abort",
    "cancel-request",
    "terminate",
    "pre-abort",
  ]) {
    async function scenario(original: boolean) {
      const trace: unknown[] = [];
      const delivery = deferred<boolean>();
      const polling = deferred<void>();
      let pollSignal: AbortSignal | undefined;
      const post = async (response: unknown, signal: AbortSignal) => {
        trace.push(["post", response, signal.aborted]);
        return await delivery.promise;
      };
      const poll = async (signal: AbortSignal) => {
        trace.push("poll");
        pollSignal = signal;
        return await polling.promise;
      };
      const abortExecution = (error: Error) =>
        trace.push(["abort-execution", error.message]);
      const client: any = original
        ? new Original(command, post, poll, abortExecution)
        : new TunnelElicitationClient(
            command,
            post,
            poll,
            abortExecution,
            () => "elicitation",
          );
      const abort = new AbortController();
      if (mode === "pre-abort") abort.abort(Error("before"));
      const output = client
        .createElicitation({ message: "permission" }, abort.signal)
        .then(
          (value: unknown) => ({ value }),
          (error: Error) => ({ error: error.message }),
        );
      const response = (result: unknown, ack = true) =>
        client.handleResponse(
          { ...command, jsonrpc: { id: "elicitation", result } },
          ack,
        );
      if (mode === "early-response") trace.push(response({ action: "accept" }));
      if (mode === "dispose-before-delivery") client.dispose();
      if (mode === "delivery-error") delivery.reject(Error("delivery failed"));
      else delivery.resolve(mode !== "delivery-false");
      await tick();
      await tick();
      if (mode === "poll-error") polling.reject(Error("poll failed"));
      else if (mode === "abort") abort.abort(Error("request aborted"));
      else if (mode === "cancel-request") {
        client.cancelRequest({
          ...command,
          jsonrpc: {
            method: "notifications/cancelled",
            params: { requestId: 8 },
          },
        });
        assert.equal(client.disposed, false);
        client.cancelRequest({
          ...command,
          jsonrpc: {
            method: "notifications/cancelled",
            params: { requestId: 7 },
          },
        });
      } else if (mode === "terminate") client.terminateSession(command);
      else if (
        ["accept", "decline", "invalid", "unacknowledged"].includes(mode)
      ) {
        trace.push(
          client.handleResponse(
            {
              ...command,
              channel: "other",
              jsonrpc: { id: "elicitation", result: { action: "accept" } },
            },
            true,
          ),
        );
        trace.push(
          response(
            {
              action:
                mode === "invalid"
                  ? "bad"
                  : mode === "decline"
                    ? "decline"
                    : "accept",
            },
            mode !== "unacknowledged",
          ),
        );
      } else if (mode === "remote-error")
        trace.push(
          client.handleResponse(
            {
              ...command,
              jsonrpc: {
                id: "elicitation",
                error: { message: "remote failure" },
              },
            },
            true,
          ),
        );
      trace.push(await output);
      assert.equal(client.pendingElicitations.size, 0);
      if (pollSignal) assert.equal(pollSignal.aborted, true);
      trace.push(["late", response({ action: "accept" })]);
      client.dispose();
      client.dispose();
      trace.push(
        await client
          .createElicitation({}, new AbortController().signal)
          .catch((error: Error) => error.message),
      );
      polling.resolve();
      return trace;
    }
    assert.deepEqual(await scenario(false), await scenario(true), mode);
  }
});

test("restored MCP -> JS -> elicitation client requires acknowledged explicit consent before execution", async () => {
  const { KernelJsHandler } =
    await import("../packages/browser-extension/src/kernel_js_handler");
  const { createKernelTunnelMcpServer } =
    await import("../packages/browser-extension/src/tunnel_mcp_server");
  const { createKernelScopeRegistry } =
    await import("../packages/browser-extension/src/kernel_scope");
  for (const mode of ["accept", "decline", "unacknowledged"]) {
    const trace: string[] = [];
    const chatApi = {
      account: { userId: "u", id: "a" },
      signal: new AbortController().signal,
      dispose() {},
    };
    const scopes = createKernelScopeRegistry<any, typeof chatApi>();
    const execution = new AbortController();
    const handler = new KernelJsHandler({
      chatApi,
      randomUUID: () => "generation",
      disposeTransport() {},
      resetKernel: async () => {},
      onTurnEnded: async () => {},
      deletePdf: async () => {},
      warn() {},
      storage: {
        async get() {
          return {};
        },
        async set() {
          trace.push("persist-consent");
        },
      },
      browserShortDisplayName: () => "Chrome",
      beginScope: scopes.begin,
      async getKernel() {
        return {
          async executeJs() {
            trace.push("execute");
            return { contentItems: ["executed"] };
          },
        };
      },
    });
    let notification: any;
    const client = new TunnelElicitationClient(
      command,
      async (response) => {
        trace.push("deliver");
        notification = response;
        return true;
      },
      async () => {
        trace.push("poll");
        assert.equal(notification.resp_json.method, "elicitation/create");
        assert.equal(notification.resp_json.params.mode, "form");
        client.handleResponse(
          {
            ...command,
            jsonrpc: {
              id: "choice",
              result: { action: mode === "decline" ? "decline" : "accept" },
            },
          },
          mode !== "unacknowledged",
        );
      },
      (error) => execution.abort(error),
      () => "choice",
    );
    const server = createKernelTunnelMcpServer(handler);
    const result: any = await server.callMethod(
      "tools/call",
      {
        name: "js",
        arguments: { code: "1+1", instance_id: "browser" },
        _meta: {
          "x-codex-turn-metadata": { session_id: "session", turn_id: "turn" },
        },
      },
      client,
      execution.signal,
      { channel: "main", requestId: "request" },
    );
    assert.deepEqual(
      trace,
      mode === "accept"
        ? ["deliver", "poll", "persist-consent", "execute"]
        : ["deliver", "poll"],
    );
    assert.equal(
      result.result._meta["openai/browser_outcome"].reason,
      mode === "accept"
        ? "none"
        : mode === "decline"
          ? "control_permission_denied"
          : "extension_runtime_error",
    );
    assert.equal(client.pendingElicitations.size, 0);
    assert.equal(handler.jsCalls.size, 0);
    assert.throws(
      () => scopes.get(handler.kernelScopeId("session")),
      /not executing/,
    );
    client.dispose();
  }
});

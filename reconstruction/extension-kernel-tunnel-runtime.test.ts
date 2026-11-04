import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createChatApiClass } from "../packages/browser-extension/src/chat_api";
import {
  createKernelTunnelRuntime,
  deleteKernelLibraryFile,
} from "../packages/browser-extension/src/kernel_tunnel_runtime";
import { createKernelControlClass } from "../packages/browser-extension/src/kernel_control";

test("Library deletion matches original encoded URL, DELETE and response cancellation", async () => {
  const { Fn } = extensionBindings(["Fn"], {});
  async function scenario(run: Function) {
    const trace: unknown[] = [];
    const api = {
      async request(path: string, init: unknown, options: any) {
        trace.push([path, init]);
        return await options.readResponse({
          body: {
            async cancel() {
              trace.push("cancel");
            },
          },
        });
      },
    };
    await run(api, { libraryFileId: "library /?", fileId: "file &?" });
    return trace;
  }
  assert.deepEqual(await scenario(deleteKernelLibraryFile), await scenario(Fn));
});

test("runtime shares real scope/control, Chat API and offscreen host across account-isolated tunnels", async () => {
  const requests: Array<{
    url: string;
    account: string | null;
    method: string | undefined;
  }> = [];
  const messages: any[] = [];
  const accounts = new Map<string, string>();
  const chatSignals: AbortSignal[] = [];
  const ChatApi = createChatApiClass({
    setTimeout,
    clearTimeout,
    fetch: async (url, init) => {
      const headers = new Headers(init?.headers);
      assert.ok(headers.get("Authorization")?.startsWith("Bearer "));
      requests.push({
        url: String(url),
        account: headers.get("ChatGPT-Account-ID"),
        method: init?.method,
      });
      return init?.method === "DELETE"
        ? new Response("removed")
        : Response.json({ rules: {} });
    },
  });
  let offscreen = false,
    created = 0;
  let Control: ReturnType<typeof createKernelControlClass<any>>;
  const runtime = createKernelTunnelRuntime({
    ChatApi,
    randomUUID: () => "generation",
    browserShortDisplayName: () => "Chrome",
    warn() {},
    storage: {
      async get() {
        return { browserUseControlAllowed: true };
      },
      async set() {},
    },
    kernelHost: {
      randomUUID: () => "request",
      offscreen: {
        async createDocument() {
          offscreen = true;
          created++;
        },
      },
      runtime: {
        getURL: (path) => `chrome-extension://fixture/${path}`,
        async getContexts() {
          return offscreen ? [{}] : [];
        },
        async sendMessage(message: any) {
          messages.push(message);
          if (message.type === "js-kernel:reset")
            return { id: message.id, ok: true };
          assert.equal(message.type, "js-kernel:execute");
          const scope = runtime.getScope(message.scopeId);
          accounts.set(message.scopeId, scope.chatApi.account.id);
          chatSignals.push(scope.chatApi.signal);
          const control = new Control(message.scopeId);
          await control.readBrowserSettings(); // actual restored ChatApi request
          control.displayValue("control output");
          await control.captureTabPdfToLibrary({});
          return {
            id: message.id,
            ok: true,
            output: { contentItems: ["kernel output"] },
          };
        },
      },
    },
  });
  Control = createKernelControlClass({
    getScope: runtime.getScope,
    siteStatusUrl: new URL("https://fixture.invalid/status"),
    fetch,
    defaultAllowedPages: [],
    getConfig: async () => undefined,
    isEnabled: async () => false,
    storage: {
      async get() {
        return {};
      },
      async set() {},
    },
    capturePdf: async () => ({ libraryFileId: "library", fileId: "file" }),
    deletePdf: deleteKernelLibraryFile as any,
  });
  const env = {
    fetch,
    now: () => performance.now(),
    wallNow: () => Date.now(),
    random: () => 0,
    randomUUID: () => "uuid",
    setTimeout,
    clearTimeout,
    version: () => "test",
    online: () => true,
    warn() {},
    reportPollingState() {},
    reportResponseFailure() {},
  };
  const ended: string[] = [];
  const tunnels = ["account-a", "account-b"].map((id) =>
    runtime.createTunnel(
      {
        baseUrl: "https://fixture.invalid",
        apiKey: "fixture-only",
        tunnelId: id,
        account: { id, userId: "user", structure: "personal" },
      },
      env,
      async (scope) => {
        ended.push(scope);
      },
    ),
  );
  const signal = new AbortController().signal;
  for (const tunnel of tunnels) {
    const call = {
      command_type: "jsonrpc",
      request_id: "call",
      jsonrpc: {
        id: 1,
        method: "tools/call",
        params: {
          name: "js",
          arguments: { code: "run", instance_id: "instance" },
          _meta: {
            "x-codex-turn-metadata": {
              session_id: "same-session",
              turn_id: "turn",
            },
          },
        },
      },
    };
    const response: any = await tunnel.getMcpResponse(
      call,
      null,
      signal,
      signal,
    );
    assert.deepEqual(response.resp_json.result.content, [
      { type: "text", text: "control output" },
      { type: "text", text: "kernel output" },
    ]);
    assert.throws(
      () => runtime.getScope(tunnel.kernel.kernelScopeId("same-session")),
      /not executing/,
    );
    await tunnel.callMethod(
      "tools/call",
      { ...call.jsonrpc.params, name: "turn_ended", arguments: {} },
      {
        async createElicitation() {
          throw Error("unexpected");
        },
      },
      signal,
      { channel: "main", requestId: "end" },
    );
  }
  assert.equal(created, 1);
  assert.equal(accounts.size, 2);
  assert.equal(new Set(ended).size, 2);
  assert.deepEqual(
    requests.map((request) => [request.account, request.method]),
    [
      ["account-a", "GET"],
      ["account-a", "DELETE"],
      ["account-b", "GET"],
      ["account-b", "DELETE"],
    ],
  );
  assert.ok(
    requests.every((request) =>
      request.url.startsWith("https://chatgpt.com/backend-api/"),
    ),
  );
  for (const tunnel of tunnels) tunnel.dispose();
  await Promise.resolve();
  await Promise.resolve();
  assert.ok(chatSignals.every((signal) => signal.aborted));
  assert.equal(
    messages.filter((message) => message.type === "js-kernel:reset").length,
    2,
  );
});

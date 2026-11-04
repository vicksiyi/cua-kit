import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  TunnelMcpServer,
  createKernelTunnelMcpServer,
  normalizeTunnelToolContext,
  validateTunnelToolArguments,
} from "../packages/browser-extension/src/tunnel_mcp_server";
import { KernelJsHandler } from "../packages/browser-extension/src/kernel_js_handler";
import { createKernelScopeRegistry } from "../packages/browser-extension/src/kernel_scope";
const source = extensionBindings(["Nr", "$s", "t_", "pt", "e_"], {
  crypto: { randomUUID: () => "session" },
});
const client = {
  async createElicitation() {
    return { action: "decline" };
  },
};
const request = { channel: "main", requestId: "request" };
const capture = (run: () => unknown) => {
  try {
    return run();
  } catch (error) {
    return { error: (error as Error).message };
  }
};

test("tunnel schema and metadata handling match original including inherited keys and fallbacks", () => {
  const schemas = [
    { type: "string" },
    { type: "number" },
    { type: "integer" },
    { type: "boolean" },
    { type: "null" },
    { type: "array", items: { type: "string" } },
    {
      type: "object",
      properties: { code: { type: "string" } },
      required: ["code"],
      additionalProperties: false,
    },
    { enum: [NaN, 0, -0, "x", null] },
    { type: "unsupported" },
  ];
  for (const schema of schemas)
    for (const value of [
      undefined,
      null,
      false,
      "x",
      0,
      -0,
      1.5,
      Infinity,
      NaN,
      [],
      ["x"],
      [1],
      {},
      { code: "x" },
      { code: "x", extra: 1 },
      Object.create({ code: "x" }),
    ])
      assert.deepEqual(
        capture(() => validateTunnelToolArguments(value, schema)),
        capture(() => source.$s(value, schema)),
      );
  for (const value of [
    undefined,
    null,
    "not JSON",
    "{}",
    '{"session_id":"s"}',
    [],
    {},
    { thread_id: "thread", session_id: "session" },
    { thread_source: "subagent", thread_id: "child", turn_id: "turn" },
    { session_id: 7, turn_id: false },
    { session_id: "s", sandbox: 0 },
  ]) {
    const meta = { other: 1, "x-codex-turn-metadata": value };
    assert.deepEqual(
      capture(() => normalizeTunnelToolContext(meta, request)),
      capture(() => source.t_(meta, request)),
    );
    assert.equal(meta["x-codex-turn-metadata"], value);
  }
});

test("tunnel methods, validation, metadata stripping and error/abort replies match actual original dispatcher", async () => {
  async function run(original: boolean) {
    const trace: unknown[] = [];
    const server = original
      ? new source.e_({ name: "test" })
      : new TunnelMcpServer({ name: "test" }, () => "session");
    const schema = {
      inputSchema: {
        type: "object",
        properties: { code: { type: "string" } },
        required: ["code"],
        additionalProperties: false,
      },
    };
    server.registerTool(
      "js",
      schema,
      async (
        input: unknown,
        _client: unknown,
        _signal: AbortSignal,
        context: unknown,
      ) => {
        trace.push(["invoke", input, context]);
        return { content: [] };
      },
    );
    assert.throws(
      () => server.registerTool("js", schema, () => {}),
      /already registered/,
    );
    const signal = new AbortController();
    for (const [method, params] of [
      ["initialize", {}],
      ["ping", {}],
      ["tools/list", {}],
      ["missing", {}],
      ["tools/call", null],
      ["tools/call", { name: "missing" }],
      ["tools/call", { name: "js", arguments: { code: 4 } }],
      [
        "tools/call",
        {
          name: "js",
          arguments: { code: "x", _meta: { injected: true } },
          _meta: {
            "x-codex-turn-metadata": JSON.stringify({ session_id: "s" }),
          },
        },
      ],
      [
        "tools/call",
        {
          name: "js",
          arguments: { code: "x" },
          _meta: { "x-codex-turn-metadata": "bad-json" },
        },
      ],
    ] as const)
      trace.push(
        await server.callMethod(method, params, client, signal.signal, request),
      );
    server.registerTool("fail", schema, () => {
      throw Error("must not leak");
    });
    trace.push(
      await server.callMethod(
        "tools/call",
        { name: "fail", arguments: { code: "x" } },
        client,
        signal.signal,
        request,
      ),
    );
    signal.abort();
    trace.push(
      await server.callMethod(
        "tools/call",
        { name: "fail", arguments: { code: "x" } },
        client,
        signal.signal,
        request,
      ),
    );
    server.unregisterTool("js");
    trace.push(
      await server.callMethod("tools/list", {}, client, signal.signal, request),
    );
    return trace;
  }
  assert.deepEqual(await run(false), await run(true));
});

test("protocol dispatcher drives real restored JS handler and scope cleanup", async () => {
  const trace: unknown[] = [];
  const chatApi = {
    account: { userId: "user", id: "account" },
    signal: new AbortController().signal,
    dispose() {},
  };
  const scopes = createKernelScopeRegistry<any, typeof chatApi, string>();
  const handler = new KernelJsHandler({
    chatApi,
    randomUUID: () => "generation",
    disposeTransport() {},
    resetKernel: async () => {},
    onTurnEnded: async (id, meta) => {
      trace.push(["ended", id, meta]);
    },
    deletePdf: async (pdf) => {
      trace.push(["pdf", pdf]);
    },
    warn() {},
    storage: {
      async get() {
        return { browserUseControlAllowed: true };
      },
      async set() {
        throw Error("already granted");
      },
    },
    browserShortDisplayName: () => "Chrome",
    beginScope: scopes.begin,
    async getKernel(id) {
      return {
        async executeJs(code, _signal, metadata) {
          trace.push(["execute", code, metadata]);
          scopes.get(id).content.push({ type: "text", text: "display" });
          scopes.get(id).onPdfUploaded?.("document");
          return { contentItems: ["result"] };
        },
      };
    },
  });
  const server = createKernelTunnelMcpServer(handler, () => "mcp-session");
  const signal = new AbortController().signal;
  const metadata = {
    "x-codex-turn-metadata": { session_id: "session", turn_id: "turn" },
  };
  const result: any = await server.callMethod(
    "tools/call",
    {
      name: "js",
      arguments: {
        code: "2+2",
        instance_id: "browser",
        _meta: { ignored: true },
      },
      _meta: metadata,
    },
    client,
    signal,
    request,
  );
  assert.deepEqual(result.result.content, [
    { type: "text", text: "display" },
    { type: "text", text: "result" },
  ]);
  assert.throws(
    () => scopes.get(handler.kernelScopeId("session")),
    /not executing/,
  );
  await server.callMethod(
    "tools/call",
    { name: "turn_ended", arguments: {}, _meta: metadata },
    client,
    signal,
    request,
  );
  assert.equal(trace.length, 3);
  assert.deepEqual(trace[2], ["pdf", "document"]);
  assert.equal(handler.pdfUploadsByTurn.size, 0);
  // Argument-level metadata cannot substitute for protocol metadata.
  const invalid: any = await server.callMethod(
    "tools/call",
    {
      name: "js",
      arguments: { code: "2+2", instance_id: "browser", _meta: metadata },
    },
    client,
    signal,
    request,
  );
  assert.equal(
    invalid.result._meta["openai/browser_outcome"].reason,
    "invalid_turn_metadata",
  );
  assert.equal(trace.length, 3);
});

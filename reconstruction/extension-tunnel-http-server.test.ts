import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { extensionBindings } from "./extension-source";
import {
  TunnelHttpServer,
  tunnelCommandDeadline,
} from "../packages/browser-extension/src/tunnel_http_server";
import { KernelHttpTunnel } from "../packages/browser-extension/src/kernel_http_tunnel";
import { createKernelScopeRegistry } from "../packages/browser-extension/src/kernel_scope";
const metadata = { "x-codex-turn-metadata": { session_id: "s", turn_id: "t" } };
const command = {
  command_type: "jsonrpc",
  request_id: "request",
  jsonrpc: { id: 1, method: "ping", params: {} },
};
function fixture(original: boolean, responses: Array<Response | Error>) {
  const trace: any[] = [];
  const record = (...args: any[]) =>
    trace.push(
      args.map((value) => (value instanceof Error ? value.message : value)),
    );
  const fetchFixture: any = async (url: string, options: any) => {
    record(
      "fetch",
      url,
      options.method,
      options.headers,
      options.body ? JSON.parse(options.body) : undefined,
    );
    if (options.method === "POST") return new Response(null, { status: 200 });
    const result = responses.shift();
    if (result instanceof Error) throw result;
    assert.ok(result);
    return result;
  };
  const config = {
    apiKey: "fixture-only",
    baseUrl: "https://fixture.invalid/base",
    tunnelId: "id/encoded",
  };
  const report = (...args: any[]) => record("state", ...args);
  const warn = (...args: any[]) => record("warn", ...args);
  const failure = async (reason: string) => record("failure", reason);
  const env = {
    fetch: fetchFixture,
    now: () => 1000,
    wallNow: () => 2000,
    random: () => 0,
    randomUUID: () => "uuid",
    setTimeout,
    clearTimeout,
    version: () => "version",
    online: () => true,
    warn,
    reportPollingState: report,
    reportResponseFailure: (...args: any[]) =>
      record("response-failure", ...args),
  };
  let server: any;
  if (original) {
    const { d_ } = extensionBindings(
      [
        "Nr",
        "$s",
        "t_",
        "pt",
        "e_",
        "Rl",
        "n_",
        "r_",
        "Bs",
        "js",
        "Cl",
        "kl",
        "h_",
        "f_",
        "d_",
      ],
      {
        Il: 25000,
        Al: 25000,
        Fs: 3,
        o_: 15000,
        c_: 30000,
        l_: 10000,
        u_: 3,
        fetch: fetchFixture,
        performance: { now: env.now },
        Date: { now: env.wallNow, parse: Date.parse },
        Math,
        setTimeout,
        clearTimeout,
        crypto: { randomUUID: env.randomUUID },
        navigator: { onLine: true },
        chrome: { runtime: { getManifest: () => ({ version: "version" }) } },
        a_: () => report,
        Ur: (...args: any[]) => record("metric", ...args),
        console: { warn },
      },
    );
    server = new d_(config, { name: "test" }, failure);
  } else server = new TunnelHttpServer(config, { name: "test" }, env, failure);
  return { server, trace };
}
test("HTTP tunnel poll status, invalidation and actual command delivery match installed class", async () => {
  for (const mode of [
    "empty",
    "invalid-json",
    "invalid-body",
    "unauthorized",
    "invalid-tunnel",
    "reset-count",
    "network",
    "command",
    "notify",
    "termination",
    "unsupported",
  ]) {
    async function run(original: boolean) {
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { status: 200 });
      const sequence =
        mode === "empty"
          ? [new Response(null, { status: 204 })]
          : mode === "invalid-json"
            ? [new Response("{")]
            : mode === "invalid-body"
              ? [json({})]
              : mode === "unauthorized"
                ? [
                    new Response(null, {
                      status: 401,
                      headers: { "Retry-After": "3" },
                    }),
                  ]
                : mode === "invalid-tunnel"
                  ? [404, 410, 404].map(
                      (status) => new Response(null, { status }),
                    )
                  : mode === "reset-count"
                    ? [404, 204, 404, 404].map(
                        (status) => new Response(null, { status }),
                      )
                    : mode === "network"
                      ? [Error("offline")]
                      : [
                          json({
                            commands: [
                              null,
                              {},
                              mode === "notify"
                                ? {
                                    ...command,
                                    jsonrpc: { method: "notification" },
                                  }
                                : mode === "termination"
                                  ? {
                                      ...command,
                                      command_type: "session_termination",
                                    }
                                  : mode === "unsupported"
                                    ? { ...command, command_type: "unknown" }
                                    : command,
                            ],
                          }),
                        ];
      const count = sequence.length;
      const { server, trace } = fixture(original, sequence);
      const signal = new AbortController().signal;
      for (let n = 0; n < count; n++)
        trace.push(["outcome", await server.pollOnce(signal)]);
      trace.push([
        "state",
        server.invalidTunnelResponses,
        server.pollRetryAfterMs,
        server.pendingCommands,
      ]);
      assert.equal(server.networkRequests.size, 0);
      assert.equal(server.activeClients.size, 0);
      return trace;
    }
    assert.deepEqual(await run(false), await run(true), mode);
  }
});
test("command duration parser matches original unit and boundary behavior", () => {
  const { h_ } = extensionBindings(["h_"], {});
  for (const value of [
    undefined,
    0,
    "0s",
    "1ns",
    "20us",
    "25ms",
    "2s",
    "3m",
    "4h",
    "-1s",
    "1.5s",
    "99999999999999999999s",
    "1d",
  ])
    assert.equal(
      tunnelCommandDeadline({ response_timeout: value }, 100),
      h_({ response_timeout: value }, 100),
    );
});

test("kernel tunnel performs real HTTP polling, consent notification, reply ack and JS response", async (t) => {
  const incoming: any[] = [
    {
      ...command,
      jsonrpc: {
        id: 1,
        method: "tools/call",
        params: {
          name: "js",
          arguments: { code: "1+1", instance_id: "browser" },
          _meta: metadata,
        },
      },
    },
  ];
  const posted: any[] = [];
  const trace: string[] = [];
  let finish!: () => void;
  const complete = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const server = createServer(async (req, res) => {
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ commands: incoming.splice(0, 1) }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const response = JSON.parse(body);
    posted.push(response);
    if (response.resp_type === "jsonrpc_notify")
      incoming.push({
        command_type: "jsonrpc",
        request_id: "consent",
        jsonrpc: { id: response.resp_json.id, result: { action: "accept" } },
      });
    res.writeHead(200);
    res.end();
    if (response.resp_type === "jsonrpc_response") finish();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address() as { port: number };
  const chatApi = {
    account: { userId: "u", id: "a" },
    signal: new AbortController().signal,
    dispose() {},
  };
  const scopes = createKernelScopeRegistry<any, typeof chatApi>();
  const tunnel = new KernelHttpTunnel(
    {
      apiKey: "local-fixture",
      baseUrl: `http://127.0.0.1:${address.port}`,
      tunnelId: "test",
    },
    {
      fetch,
      now: () => performance.now(),
      wallNow: () => Date.now(),
      random: () => 0,
      randomUUID: () => "choice",
      setTimeout,
      clearTimeout,
      version: () => "test",
      online: () => true,
      warn() {},
      reportPollingState() {},
      reportResponseFailure() {},
    },
    {
      chatApi,
      randomUUID: () => "generation",
      resetKernel: async () => {},
      onTurnEnded: async () => {},
      deletePdf: async () => {},
      warn() {},
      storage: {
        async get() {
          return {};
        },
        async set() {
          trace.push("consent");
        },
      },
      browserShortDisplayName: () => "Chrome",
      beginScope: scopes.begin,
      async getKernel() {
        return {
          async executeJs() {
            trace.push("execute");
            return { contentItems: ["result"] };
          },
        };
      },
    },
  );
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(Error("test timeout")), 5000);
  t.after(() => {
    clearTimeout(timeout);
    abort.abort();
    tunnel.dispose();
  });
  const run = tunnel.run(abort.signal);
  await Promise.race([
    complete,
    new Promise((_, reject) =>
      abort.signal.addEventListener(
        "abort",
        () => reject(abort.signal.reason),
        { once: true },
      ),
    ),
  ]);
  abort.abort();
  await run;
  assert.deepEqual(trace, ["consent", "execute"]);
  assert.deepEqual(
    posted.map((value) => value.resp_type),
    ["jsonrpc_notify", "notify_ack", "jsonrpc_response"],
  );
  assert.deepEqual(posted[2].resp_json.result.content, [
    { type: "text", text: "result" },
  ]);
  assert.equal(tunnel.activeClients.size, 0);
});

test("poll startup restart, listening stop, overdue expiration and dispose match original", async () => {
  async function scenario(original: boolean) {
    const { server, trace } = fixture(original, []);
    const pending: Array<{
      resolve: () => void;
      reject: (error: Error) => void;
    }> = [];
    server.run = async (signal: AbortSignal) => {
      trace.push(["run", signal.aborted]);
      await new Promise<void>((resolve, reject) =>
        pending.push({ resolve, reject }),
      );
    };
    await server.initialize();
    await server.initialize();
    assert.equal(pending.length, 1);
    pending[0]!.resolve();
    for (let n = 0; n < 10; n++) await Promise.resolve();
    assert.equal(pending.length, 2); // normal return restarts while listening
    pending[1]!.reject(Error("failure"));
    for (let n = 0; n < 10; n++) await Promise.resolve();
    assert.equal(server.controller, null);
    server.setListening(false);
    await server.initialize();
    assert.equal(pending.length, 2);
    server.setListening(true);
    server.networkRequests.add({
      expireIfOverdue() {
        trace.push(["expire"]);
      },
    });
    await server.ensurePolling();
    assert.equal(pending.length, 3);
    const running = server.controller;
    server.activeClients.add({
      cancel(error: Error) {
        trace.push(["cancel", error.message]);
      },
    });
    server.dispose();
    assert.equal(running.signal.aborted, true);
    pending[2]!.resolve();
    for (let n = 0; n < 10; n++) await Promise.resolve();
    assert.equal(pending.length, 3);
    assert.equal(server.controller, null);
    return trace;
  }
  assert.deepEqual(await scenario(false), await scenario(true));
});

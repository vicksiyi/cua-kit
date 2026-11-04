import test from "node:test";
import assert from "node:assert/strict";
import { parse } from "acorn";
import { extractNodeReplSources } from "../scripts/extract-node-repl-sources.mjs";
import { createNativePipeBridge } from "../packages/node-repl/src/native_pipe_bridge";
import { createExecContext } from "../packages/node-repl/src/exec_context";
const { files } = await extractNodeReplSources(
  process.env.CUA_NODE_REPL_BINARY,
);
function body(source: string, names: string[]) {
  return parse(source, { ecmaVersion: "latest", sourceType: "script" })
    .body.filter(
      (n: any) => n.type === "FunctionDeclaration" && names.includes(n.id.name),
    )
    .map((n) => source.slice(n.start, n.end))
    .join("\n");
}
const realm = { exports: {} as any };
new Function("module", files["realmChecks.js"])(realm);
const original = new Function(
  "Buffer",
  "isArrayBuffer",
  body(files["worker-runtime.js"], ["toByteArray"]) +
    body(files["privileged-node-repl.js"], ["createNativePipeBridge"]) +
    ";return createNativePipeBridge;",
)(Buffer, realm.exports.isArrayBuffer);
const tick = () => new Promise((r) => setImmediate(r));
function fixture(factory: any) {
  const execContext = createExecContext<any>(),
    messages: any[] = [];
  const bridge = factory({
    execContext,
    send: (message: any) => messages.push(message),
  });
  const respond = (id: string, result: any, ok = true, error?: string) =>
    bridge.handleMessage({
      type: "native_pipe_response",
      id,
      result,
      ok,
      error,
    });
  return { execContext, messages, bridge, respond };
}
async function connect(f: any, id = "pipe") {
  const pending = f.execContext.run({ id: "a" }, () =>
    f.bridge.nativePipe.createConnection("fixture"),
  );
  f.respond(f.messages.at(-1).id, { connection_id: id });
  return pending;
}
test("native pipe bridge preserves path/connect validation and request-before-context ordering", async () => {
  for (const factory of [original, createNativePipeBridge]) {
    const f = fixture(factory);
    assert.ok(Object.isFrozen(f.bridge.nativePipe));
    for (const value of [undefined, null, "", 1])
      await assert.rejects(
        f.bridge.nativePipe.createConnection(value),
        /path must be a non-empty string/,
      );
    assert.equal(f.messages.length, 0);
    for (const value of [
      null,
      {},
      { connection_id: 1 },
      { connection_id: "" },
    ]) {
      const pending = f.execContext.run({ id: "a" }, () =>
        f.bridge.nativePipe.createConnection(" "),
      );
      f.respond(f.messages.at(-1).id, value);
      await assert.rejects(pending, /invalid connection id/);
    }
    const missing = f.bridge.nativePipe.createConnection("fixture");
    f.respond(f.messages.at(-1).id, { connection_id: "valid" });
    await assert.rejects(missing, /exec context not found/);
    const failed = f.bridge.nativePipe.createConnection("fixture");
    f.respond(f.messages.at(-1).id, null, false);
    await assert.rejects(failed, /native pipe request failed/);
    assert.equal(
      f.bridge.handleMessage({ type: "native_pipe_response", id: "missing" }),
      true,
    );
    assert.equal(f.bridge.handleMessage({ type: "unknown" }), false);
  }
});
test("native pipe bridge preserves bytes, listener order and latest-write execution context", async () => {
  const runs = [];
  for (const factory of [original, createNativePipeBridge]) {
    const f = fixture(factory),
      connection = await connect(f),
      events: any[] = [];
    assert.ok(Object.isFrozen(connection));
    const listener = (bytes: Buffer) =>
      events.push({
        kind: "data",
        bytes: [...bytes],
        context: f.execContext.getOptional()?.id,
      });
    connection.on("data", listener);
    connection.on("data", listener);
    f.bridge.handleMessage({
      type: "native_pipe_data",
      connection_id: "pipe",
      data_base64: "AQI=",
    });
    f.execContext.run({ id: "b" }, () => {
      assert.throws(() => connection.write("invalid"), /write expected bytes/);
    });
    f.bridge.handleMessage({
      type: "native_pipe_data",
      connection_id: "pipe",
      data_base64: "Aw==",
    });
    const bytes = Uint8Array.from([0, 4, 5, 0]);
    connection.write(new DataView(bytes.buffer, 1, 2));
    f.respond(f.messages.at(-1).id, null);
    await tick();
    connection.off("data", listener);
    f.bridge.handleMessage({
      type: "native_pipe_data",
      connection_id: "pipe",
      data_base64: "AA==",
    });
    assert.throws(
      () => connection.on("bogus", () => {}),
      /unsupported native pipe event/,
    );
    assert.throws(
      () => connection.on("data", 1),
      /listener must be a function/,
    );
    assert.throws(
      () => connection.off("bogus", listener),
      /unsupported native pipe event/,
    );
    connection.on("error", (error: Error) =>
      events.push({
        kind: "error",
        message: error.message,
        context: f.execContext.getOptional()?.id,
      }),
    );
    connection.on("close", () =>
      events.push({ kind: "close", context: f.execContext.getOptional()?.id }),
    );
    f.bridge.handleMessage({
      type: "native_pipe_closed",
      connection_id: "pipe",
      error: "fixture closed",
    });
    assert.equal(events.length, 2);
    await tick();
    const before = f.messages.length;
    connection.write("ignored after close");
    assert.equal(f.messages.length, before);
    connection.end();
    connection.end();
    for (const message of f.messages.slice(-2))
      f.respond(message.id, null, false, "ignored close error");
    await tick();
    runs.push({ events, messages: f.messages });
  }
  assert.deepEqual(runs[1], runs[0]);
  assert.deepEqual(
    runs[1].events.map((e: any) => e.context),
    ["a", "b", "b", "b"],
  );
  assert.equal(runs[1].messages[1].data_base64, "BAU=");
});
test("native pipe bridge retains early closure, late terminal listeners and original write-failure behavior", async () => {
  const runs = [];
  for (const factory of [original, createNativePipeBridge]) {
    const f = fixture(factory),
      events: string[] = [];
    const pending = f.execContext.run({ id: "a" }, () =>
      f.bridge.nativePipe.createConnection("fixture"),
    );
    f.bridge.handleMessage({
      type: "native_pipe_closed",
      connection_id: "early",
      error: "early close",
    });
    f.respond(f.messages[0].id, { connection_id: "early" });
    const early = await pending;
    const close = () => events.push("early-close");
    early.on("error", (e: Error) => events.push(e.message));
    early.on("close", close);
    early.on("close", close);
    await tick();
    early.write("ignored");
    assert.equal(f.messages.length, 1);
    const pipe = await connect(f, "later");
    pipe.on("error", (e: Error) => {
      events.push(e.message);
      throw new Error("listener ignored");
    });
    pipe.on("close", () => events.push("closed"));
    pipe.on("data", () => events.push("data-after-write-failure"));
    pipe.write(new Uint8Array([1]));
    f.respond(f.messages.at(-1).id, null, false, "write failed");
    await tick();
    f.bridge.handleMessage({
      type: "native_pipe_data",
      connection_id: "later",
      data_base64: "AQ==",
    });
    f.bridge.handleMessage({
      type: "native_pipe_closed",
      connection_id: "later",
      error: "another close",
    });
    await tick();
    pipe.on("close", () => events.push("late-close"));
    await tick();
    const thrower = await connect(f, "throws");
    thrower.on("data", () => {
      throw new Error("sync data listener");
    });
    assert.throws(
      () =>
        f.bridge.handleMessage({
          type: "native_pipe_data",
          connection_id: "throws",
          data_base64: "AA==",
        }),
      /sync data listener/,
    );
    runs.push({ events, messages: f.messages });
  }
  assert.deepEqual(runs[1], runs[0]);
  assert.deepEqual(runs[1].events, [
    "early close",
    "early-close",
    "write failed",
    "closed",
    "data-after-write-failure",
    "late-close",
  ]);
});

test("restored Windows transport exchanges framed RPC through restored NodeREPL native-pipe bridge", async () => {
  const { WindowsNativePipeTransport } =
    await import("../packages/sky/src/targets/windows/internal/native_pipe_transport");
  const context = createExecContext<any>(),
    messages: any[] = [];
  const bridge = createNativePipeBridge({
    execContext: context,
    send: (message: any) => {
      messages.push(message);
      queueMicrotask(() => {
        bridge.handleMessage({
          type: "native_pipe_response",
          id: message.id,
          ok: true,
          result:
            message.op === "connect" ? { connection_id: "fixture" } : null,
        });
        if (message.op === "write") {
          const frame = Buffer.from(message.data_base64, "base64");
          assert.equal(frame.readUInt32LE(0), frame.length - 4);
          const rpc = JSON.parse(frame.subarray(4).toString());
          const payload = Buffer.from(
            JSON.stringify({
              id: rpc.id,
              jsonrpc: "2.0",
              result: { method: rpc.params.method, params: rpc.params.params },
            }),
          );
          const header = Buffer.alloc(4);
          header.writeUInt32LE(payload.length);
          const response = Buffer.concat([header, payload]);
          for (const bytes of [response.subarray(0, 2), response.subarray(2)])
            bridge.handleMessage({
              type: "native_pipe_data",
              connection_id: "fixture",
              data_base64: bytes.toString("base64"),
            });
        }
        if (message.op === "close")
          bridge.handleMessage({
            type: "native_pipe_closed",
            connection_id: "fixture",
          });
      });
    },
  });
  const transport = new WindowsNativePipeTransport(
    {
      config: {},
      env: { SKY_CUA_NATIVE_PIPE_DIRECTORY: "fixture" },
      nativePipe: bridge.nativePipe,
    },
    1000,
  );
  await context.run({ id: "fixture-exec" }, async () => {
    assert.deepEqual(await transport.request("click", { x: 1, y: 2 }), {
      method: "click",
      params: { x: 1, y: 2 },
    });
    assert.deepEqual(await transport.request("list_windows", {}), {
      method: "list_windows",
      params: {},
    });
    await transport.close();
    await tick();
  });
  assert.deepEqual(
    messages.map((m) => m.op),
    ["connect", "write", "write", "close"],
  );
});

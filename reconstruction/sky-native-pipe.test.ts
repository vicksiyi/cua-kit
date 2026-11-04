import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { pathToFileURL } from "node:url";
import { createServer, createConnection } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as restored from "../packages/sky/src/targets/mac/native-pipe";
import * as errors from "../packages/sky/src/targets/mac/errors";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const base = `${root}/sky/dist/project/cua/sky_js/src/targets/mac/`;
const original = await import(pathToFileURL(base + "native-pipe.js").href);
const originalErrors = await import(pathToFileURL(base + "errors.js").href);
function errorShape(error: any): any {
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    errorName: error.errorName,
    request: error.request,
    requestType: error.requestType,
    cause: error.cause ? errorShape(error.cause) : undefined,
  };
}
async function result(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error: errorShape(error) };
  }
}
class Socket extends EventEmitter {
  writes: any[] = [];
  ends = 0;
  callback: (request: any) => void = () => {};
  write(bytes: Uint8Array) {
    const message = JSON.parse(
      restored.decodeMessageFrames(Buffer.from(bytes)).messages[0],
    );
    this.writes.push(message);
    this.callback(message);
  }
  end() {
    this.ends++;
    this.emit("close");
  }
  reply(value: any, fragment = false) {
    const frame = restored.encodeMessageFrame(JSON.stringify(value));
    if (fragment) {
      this.emit("data", frame.subarray(0, 3));
      this.emit("data", frame.subarray(3));
    } else this.emit("data", frame);
  }
}
async function host<T>(runtime: any, run: () => Promise<T>) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "nodeRepl");
  Object.defineProperty(globalThis, "nodeRepl", {
    configurable: true,
    value: runtime,
  });
  try {
    return await run();
  } finally {
    if (prior) Object.defineProperty(globalThis, "nodeRepl", prior);
    else Reflect.deleteProperty(globalThis, "nodeRepl");
  }
}
test("Mac native errors and fragmented framing match installed implementation", async () => {
  assert.deepEqual(errors.ServerErrorCode, originalErrors.ServerErrorCode);
  for (const code of [...Object.values(errors.ServerErrorCode), 123])
    assert.deepEqual(
      errorShape(
        new errors.SkyComputerUseError({
          code,
          message: "test",
          request: { x: 1 },
          requestType: "click",
        }),
      ),
      errorShape(
        new originalErrors.SkyComputerUseError({
          code,
          message: "test",
          request: { x: 1 },
          requestType: "click",
        }),
      ),
    );
  for (const text of [
    "",
    "hello",
    "中文🙂",
    "x".repeat(8388608),
    "x".repeat(8388609),
  ])
    assert.deepEqual(
      await result(() => restored.encodeMessageFrame(text)),
      await result(() => original.encodeMessageFrame(text)),
    );
  const frame = Buffer.concat([
    restored.encodeMessageFrame("first"),
    restored.encodeMessageFrame("中文"),
  ]);
  for (let end = 0; end <= frame.length; end++)
    assert.deepEqual(
      restored.decodeMessageFrames(frame.subarray(0, end)),
      original.decodeMessageFrames(frame.subarray(0, end)),
    );
  const invalid = Buffer.alloc(4);
  invalid.writeUInt32LE(8388609);
  assert.deepEqual(
    await result(() => restored.decodeMessageFrames(invalid)),
    await result(() => original.decodeMessageFrames(invalid)),
  );
});
test("Mac request queue, metadata, wire errors and write failure preserve original behavior", async () => {
  for (const mode of [
    "normal",
    "server-error",
    "write-error",
    "invalid-json",
    "invalid-response",
    "close",
    "error",
    "timeout",
  ]) {
    async function run(api: any) {
      const socket = new Socket();
      let first = true;
      socket.callback = (request) => {
        if (first) {
          first = false;
          if (mode === "write-error") throw "write failed";
        }
        queueMicrotask(() => {
          if (mode === "timeout") return;
          if (mode === "close") {
            socket.emit("close");
            return;
          }
          if (mode === "error") {
            socket.emit("error", Error("socket failure"));
            return;
          }
          if (mode === "invalid-json") {
            socket.emit("data", restored.encodeMessageFrame("{"));
            return;
          }
          if (mode === "invalid-response") {
            socket.reply({
              id: request.id,
              jsonrpc: "2.0",
              result: 1,
              error: { code: 1, message: "both" },
            });
            return;
          }
          socket.reply({ id: 999, jsonrpc: "2.0", result: "ignored" });
          socket.reply(
            mode === "server-error"
              ? {
                  id: request.id,
                  jsonrpc: "2.0",
                  error: { code: -10015, message: "blocked" },
                }
              : {
                  id: request.id,
                  jsonrpc: "2.0",
                  result: request.params.request,
                },
            true,
          );
        });
      };
      const transport = new api.MacNativePipeTransport(socket, "v1");
      const responses = await Promise.all(
        [0, 1, 2].map((index) =>
          result(() =>
            transport.request({
              codexMetadata:
                index === 0
                  ? '{"model":"fixture"}'
                  : index === 1
                    ? Buffer.from('{"n":1}')
                    : { direct: true },
              request: { index },
              requestType: "fixture",
              timeoutSeconds: 0.02,
            }),
          ),
        ),
      );
      const writes = socket.writes.map(({ params, ...rest }: any) => {
        assert.ok(Number.isFinite(params.deadlineUnixMilliseconds));
        return {
          ...rest,
          params: { ...params, deadlineUnixMilliseconds: "deadline" },
        };
      });
      return {
        responses,
        writes,
        closed: transport.isClosed,
        ends: socket.ends,
      };
    }
    assert.deepEqual(await run(restored), await run(original), mode);
  }
});
test("Mac host requests preserve attachment uncertainty and listener cleanup", async () => {
  for (const method of ["ensureService", "attachComputerAudio"])
    for (const mode of [
      "success",
      "error",
      "invalid",
      "bad-json",
      "close",
      "write-error",
    ]) {
      async function run(api: any) {
        const socket = new Socket();
        socket.callback = (request) => {
          if (mode === "write-error") throw Error("write");
          queueMicrotask(() => {
            if (mode === "close") {
              socket.emit("close");
              return;
            }
            if (mode === "bad-json") {
              socket.emit("data", restored.encodeMessageFrame("{"));
              return;
            }
            socket.reply({ id: "unrelated", result: true });
            socket.reply(
              {
                id: request.id,
                ...(mode === "success"
                  ? { result: {} }
                  : mode === "error"
                    ? { error: { message: "refused" } }
                    : {}),
              },
              true,
            );
          });
        };
        const response = await host(
          {
            env: { NODE_REPL_HOST_SERVICES_PIPE_PATH: " /synthetic " },
            nativePipe: {
              async createConnection(name: string) {
                assert.equal(name, "/synthetic");
                return socket;
              },
            },
          },
          () =>
            result(() =>
              api.requestComputerUseHost(method, { service: "fixture" }),
            ),
        );
        const request = socket.writes[0];
        assert.equal(
          method === "ensureService"
            ? request.id === 0
            : typeof request.id === "string",
          true,
        );
        return {
          response,
          request: { ...request, id: "id" },
          ends: socket.ends,
          listeners: socket.eventNames(),
        };
      }
      assert.deepEqual(await run(restored), await run(original), method + mode);
    }
});
test("Mac startup ping rejects incompatible versions without requesting service launch", async () => {
  for (const mode of ["success", "version", "server-error"]) {
    async function run(api: any) {
      const socket = new Socket();
      socket.callback = (request) =>
        queueMicrotask(() =>
          socket.reply(
            mode === "server-error"
              ? {
                  id: request.id,
                  jsonrpc: "2.0",
                  error: { code: -10013, message: "incompatible" },
                }
              : {
                  id: request.id,
                  jsonrpc: "2.0",
                  result: {
                    serverApiVersion: mode === "version" ? "other" : "v1",
                  },
                },
          ),
        );
      let launches = 0;
      const response = await host(
        {
          env: { SKY_CUA_SERVICE_NATIVE_PIPE_PATH: " /synthetic " },
          nativePipe: {
            async createConnection(p: string) {
              assert.equal(p, "/synthetic");
              return socket;
            },
          },
          launchServices: {
            openApplication() {
              launches++;
            },
          },
        },
        () =>
          result(async () => {
            const transport = await api.MacNativePipeTransport.create("v1");
            return transport.isClosed;
          }),
      );
      return { response, launches, writes: socket.writes, ends: socket.ends };
    }
    assert.deepEqual(await run(restored), await run(original));
  }
});
test("Mac startup retries failed connections then uses explicit launchServices application path", async () => {
  async function run(api: any) {
    const socket = new Socket();
    socket.callback = (request) =>
      queueMicrotask(() =>
        socket.reply({
          id: request.id,
          jsonrpc: "2.0",
          result: { serverApiVersion: "v1" },
        }),
      );
    let launched = false;
    const events: any[] = [];
    const value = await host(
      {
        env: {
          SKY_CUA_SERVICE_NATIVE_PIPE_PATH: "/synthetic",
          SKY_CUA_SERVICE_PATH: " /fixture.app ",
        },
        nativePipe: {
          async createConnection() {
            if (!launched) throw Error("not started");
            events.push("connect");
            return socket;
          },
        },
        launchServices: {
          async openApplication(args: any) {
            events.push(args);
            launched = true;
          },
        },
      },
      async () => {
        const transport = await api.MacNativePipeTransport.create("v1");
        return transport.isClosed;
      },
    );
    return { value, events, writes: socket.writes };
  }
  assert.deepEqual(await run(restored), await run(original));
});
test("Mac restored transport uses a real isolated Unix socket for handshake and queued RPC", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "sky-pipe-")),
    socketPath = path.join(directory, "test.sock");
  const connections = new Set<any>(),
    requests: any[] = [];
  const server = createServer((socket) => {
    connections.add(socket);
    socket.on("close", () => connections.delete(socket));
    let buffer: Buffer = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const decoded = restored.decodeMessageFrames(buffer);
      buffer = decoded.remainingData;
      for (const message of decoded.messages) {
        const request = JSON.parse(message);
        requests.push(request);
        const reply = restored.encodeMessageFrame(
          JSON.stringify({
            id: request.id,
            jsonrpc: "2.0",
            result:
              request.method === "ping"
                ? { serverApiVersion: "fixture-v1" }
                : request.params.request,
          }),
        );
        socket.write(reply.subarray(0, 2));
        socket.write(reply.subarray(2));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  try {
    await host(
      {
        env: { SKY_CUA_SERVICE_NATIVE_PIPE_PATH: socketPath },
        nativePipe: {
          createConnection: (p: string) =>
            new Promise((resolve, reject) => {
              const socket = createConnection(p, () => resolve(socket));
              socket.once("error", reject);
            }),
        },
      },
      async () => {
        const transport =
          await restored.MacNativePipeTransport.create("fixture-v1");
        assert.deepEqual(
          await Promise.all(
            [1, 2].map((n) =>
              transport.request({
                codexMetadata: { model: "fixture" },
                request: { n },
                requestType: "synthetic",
                timeoutSeconds: 1,
              }),
            ),
          ),
          [{ n: 1 }, { n: 2 }],
        );
        assert.deepEqual(
          requests.map((r) => r.method),
          ["ping", "request", "request"],
        );
        for (const socket of connections) socket.end();
      },
    );
  } finally {
    for (const socket of connections) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

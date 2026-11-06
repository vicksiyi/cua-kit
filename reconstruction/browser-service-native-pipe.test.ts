import test from "node:test";
import assert from "node:assert/strict";
import { endianness, tmpdir } from "node:os";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { createServer, createConnection } from "node:net";
import {
  NativePipeFrameDecoder,
  encodeNativePipeFrame,
  NativePipeTransport,
} from "../packages/browser/src/service/runtime/native_pipe";
import {
  createBrowserPipeClass,
  nativePipeMessage,
  nativePipeUnavailableMessage,
  privilegedNativePipe,
} from "../packages/browser/src/service/runtime/native_pipe_bridge";
import { BrowserRpcPeer } from "../packages/browser/src/service/runtime/rpc_peer";
import { BrowserApi } from "../packages/browser/src/service/runtime/browser_api";
import {
  originalServiceBindings,
  serviceClassWithMethods,
  serviceSourceSha256,
} from "./service-source";
if (
  serviceSourceSha256 !==
  "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021"
)
  throw Error("Native pipe source changed; re-audit helpers before comparison");
const decoderClass = serviceClassWithMethods([
  "push",
  "append",
  "peekBytes",
  "consumeBytes",
  "discardFirstChunk",
]);
const transportClass = serviceClassWithMethods([
  "sendMessage",
  "setMessageCallback",
  "addCloseListener",
  "isClosed",
  "handleData",
  "markClosed",
]);
const original = originalServiceBindings(
  ["db", "Ox", decoderClass, "Yue", "Jue", "h6", transportClass, "b6", "ele"],
  { ud: Buffer, g6: endianness, us: 4 },
);
test("native framing matches original chunking, limits, UTF-8 and single-response state", () => {
  for (const text of ["", "ascii", "合成😀", "x".repeat(100)])
    for (const max of [0, 4, 1024]) {
      const run = (fn: any) => {
        try {
          return fn(text, max);
        } catch (error: any) {
          return [error.message, error.messageBytes, error.maxFrameBytes];
        }
      };
      assert.deepEqual(run(encodeNativePipeFrame), run(original.Ox));
    }
  const encoded = Buffer.concat(
    ["one", "合成😀", "", "last"].map((value) => encodeNativePipeFrame(value)),
  );
  for (const single of [false, true])
    for (const size of [1, 2, 3, 4, 7, encoded.length]) {
      function run(Source: any) {
        const decoder = new Source(1024, single),
          trace: any[] = [];
        for (let offset = 0; offset < encoded.length; offset += size)
          try {
            trace.push(decoder.push(encoded.subarray(offset, offset + size)));
          } catch (error: any) {
            trace.push(error.message);
            break;
          }
        trace.push([
          decoder.byteLength,
          decoder.chunkStart,
          decoder.responseReceived,
        ]);
        return trace;
      }
      assert.deepEqual(
        run(NativePipeFrameDecoder),
        run(original[decoderClass]),
      );
    }
  for (const Source of [NativePipeFrameDecoder, original[decoderClass]]) {
    const decoder = new Source(2);
    assert.throws(
      () => decoder.push(encodeNativePipeFrame("long")),
      /exceeds limit/,
    );
    const single = new Source(100, true);
    assert.deepEqual(single.push(encodeNativePipeFrame("x")), ["x"]);
    assert.deepEqual(single.push(new Uint8Array()), []);
    assert.throws(() => single.push(new Uint8Array([1])), /one response/);
  }
  function compaction(Source: any) {
    const decoder = new Source();
    const frame = encodeNativePipeFrame("x");
    for (let i = 0; i < 2400; i++) decoder.append(frame);
    decoder.consumeBytes(frame.length * 1800);
    return [
      decoder.chunkStart,
      decoder.chunks.length,
      decoder.byteLength,
      decoder.push(new Uint8Array()),
    ];
  }
  assert.deepEqual(
    compaction(NativePipeFrameDecoder),
    compaction(original[decoderClass]),
  );
});
test("native transport preserves original deferred response and close/error ordering", async () => {
  for (const mode of [
    "normal",
    "single",
    "extra",
    "partial",
    "parse-error",
    "invalid",
    "callback-error",
    "decode-ignore",
    "socket-error",
    "explicit",
    "close-hook",
  ]) {
    async function run(source: boolean) {
      const trace: any[] = [];
      class Socket extends EventEmitter {
        write(bytes: any) {
          trace.push(["write", bytes.toString("hex")]);
        }
        end() {
          trace.push(["end"]);
        }
      }
      const socket = new Socket();
      const Transport = source ? original[transportClass] : NativePipeTransport;
      const transport = new Transport(socket, {
        decodeMessage: (value: any) =>
          mode === "decode-ignore"
            ? undefined
            : (source ? original.b6 : nativePipeMessage)(value),
        singleResponse: ["single", "extra", "partial"].includes(mode),
        closeSocket:
          mode === "close-hook"
            ? () => {
                trace.push(["hook"]);
                throw Error("hook");
              }
            : undefined,
      });
      transport.addCloseListener((error: any) => {
        trace.push(["closed", error?.message]);
      });
      transport.addCloseListener(() => {
        throw Error("listener");
      });
      const remove = transport.addCloseListener(() => trace.push(["removed"]));
      remove();
      transport.setMessageCallback((value: any) => {
        trace.push(["message", value]);
        if (mode === "callback-error") throw "callback";
      });
      transport.sendMessage({ synthetic: true });
      if (mode === "socket-error") socket.emit("error", Error("socket"));
      else if (mode === "explicit" || mode === "close-hook")
        await transport.close(Error("explicit"));
      else {
        let bytes = encodeNativePipeFrame(
          mode === "parse-error"
            ? "{"
            : JSON.stringify(mode === "invalid" ? [] : { ok: true }),
        );
        if (mode === "extra")
          bytes = Buffer.concat([bytes, encodeNativePipeFrame("{}")]);
        if (mode === "partial") bytes = bytes.subarray(0, 5);
        socket.emit("data", bytes);
        socket.emit("close");
      }
      await transport.close();
      transport.addCloseListener((error: any) =>
        trace.push(["late", error?.message]),
      );
      await Promise.resolve();
      await Promise.resolve();
      trace.push(["isClosed", transport.isClosed()]);
      try {
        transport.sendMessage({});
      } catch (error: any) {
        trace.push(["send error", error.message]);
      }
      socket.emit("data", encodeNativePipeFrame("{}"));
      return trace;
    }
    assert.deepEqual(await run(false), await run(true), mode);
  }
});
test("privileged pipe factory matches original absence checks and constructor return identity", async () => {
  for (const environment of ["production", "development"]) {
    const { Que } = originalServiceBindings(["Que"], { mo: () => environment });
    assert.equal(nativePipeUnavailableMessage(environment), Que());
    const sourceFactory = originalServiceBindings(["Nx", "Wo"], {
      ls: original[transportClass],
      b6: original.b6,
      ele: () => null,
      Que,
    });
    for (const factory of [
      createBrowserPipeClass(
        () => environment,
        () => null,
      ),
      { BrowserPipe: sourceFactory.Wo, connect: sourceFactory.Nx },
    ]) {
      await assert.rejects(
        factory.BrowserPipe.create("synthetic"),
        /privileged native pipe bridge/,
      );
      await assert.rejects(
        factory.connect(
          "synthetic",
          { decodeMessage: nativePipeMessage },
          "custom",
        ),
        /^Error: custom$/,
      );
    }
  }
  // create returns the base transport, whereas direct construction returns the subclass.
  for (const source of [false, true]) {
    const paths: string[] = [];
    class Socket extends EventEmitter {
      write() {}
      end() {}
    }
    const bridge = {
      createConnection: async (path: string) => {
        paths.push(path);
        return new Socket();
      },
    };
    const factory = source
      ? originalServiceBindings(["Nx", "Wo"], {
          ls: original[transportClass],
          b6: original.b6,
          ele: () => bridge,
          Que: () => "unexpected missing bridge",
        })
      : undefined;
    const Pipe = source
      ? factory!.Wo
      : createBrowserPipeClass(
          () => "production",
          () => bridge,
        ).BrowserPipe;
    const value = await Pipe.create("owned-fixture");
    assert.equal(value instanceof Pipe, false);
    assert.equal(
      value instanceof
        (source ? original[transportClass] : NativePipeTransport),
      true,
    );
    const direct = new Pipe(new Socket());
    assert.equal(direct instanceof Pipe, true);
    assert.deepEqual(paths, ["owned-fixture"]);
    await value.close();
    await direct.close();
  }
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "nodeRepl");
  try {
    for (const value of [
      undefined,
      {},
      { nativePipe: {} },
      { nativePipe: { createConnection() {} } },
    ]) {
      Object.defineProperty(globalThis, "nodeRepl", {
        value,
        configurable: true,
      });
      assert.equal(privilegedNativePipe(), original.ele());
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "nodeRepl", descriptor);
    else delete (globalThis as any).nodeRepl;
  }
});
test("real Unix socket transports restored framed RPC and BrowserApi session requests", async () => {
  const root = await mkdtemp(join(tmpdir(), "cua-pipe-")),
    socketPath = join(root, "rpc.sock");
  const received: any[] = [];
  const serverTransports: NativePipeTransport[] = [];
  const server = createServer((socket) => {
    const transport = new NativePipeTransport(socket, {
      decodeMessage: nativePipeMessage,
    });
    serverTransports.push(transport);
    const peer = new BrowserRpcPeer(transport);
    peer.registerRequestHandler("getInfo", (params: any) => {
      received.push(["info", params]);
      return { type: "iab" };
    });
    peer.registerRequestHandler("getTabs", (params: any) => {
      received.push(["tabs", params]);
      return [{ id: 1, url: "https://fixture.invalid" }];
    });
    peer.registerRequestHandler("turnEnded", () => ({}));
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  let client: any;
  try {
    const { BrowserPipe } = createBrowserPipeClass(
      () => "production",
      () => ({
        createConnection: async (path: string) =>
          await new Promise((resolve, reject) => {
            const socket = createConnection(path);
            socket.once("connect", () => resolve(socket));
            socket.once("error", reject);
          }),
      }),
    );
    client = await BrowserPipe.create(socketPath);
    assert.ok(client instanceof NativePipeTransport);
    assert.equal(client instanceof BrowserPipe, false);
    const api = new BrowserApi(
      client,
      {
        ping() {
          return "pong";
        },
      },
      () => ({ session_id: "s", turn_id: "t" }),
      undefined,
      undefined,
      undefined,
      undefined,
    );
    assert.equal((await api.getInfo()).type, "iab");
    assert.deepEqual(await api.getTabs(), [
      { id: 1, url: "https://fixture.invalid" },
    ]);
    assert.equal(received[1][1].session_id, "s");
    assert.equal(received[1][1].session_context, "live");
    await api.close();
    assert.equal(api.closed, true);
  } finally {
    await client?.close();
    await Promise.all(serverTransports.map((transport) => transport.close()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

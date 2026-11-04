import test from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  sign,
  createPublicKey,
  verify,
} from "node:crypto";
import {
  createBrowserAccessVerifier,
  browserAccessDomain,
} from "../packages/browser/src/service/runtime/browser_access";
import { codexTurnMetadata } from "../packages/browser/src/service/preferences/request_context";
import { originalServiceBindings } from "./service-source";
const keys = generateKeyPairSync("ed25519");
const identity = keys.publicKey
  .export({ type: "spki", format: "der" })
  .toString("base64");
async function run(source: boolean, mode: string) {
  const trace: any[] = [];
  let timerCallback: any;
  let meta: any = {
    session_id: "session",
    turn_id: "turn",
    thread_source: "subagent",
    thread_id: "child",
  };
  const runtime: any = {
    env: {
      BROWSER_USE_ACCESS_EXECUTOR_ID:
        mode === "no-executor" ? undefined : "executor",
      BROWSER_USE_ACCESS_PIPE_PATH:
        mode === "missing-pipe" ? undefined : "synthetic",
      BROWSER_USE_ACCESS_VERIFYING_IDENTITY:
        mode === "bad-key"
          ? "broken"
          : mode === "missing-key"
            ? undefined
            : identity,
    },
    get requestMeta() {
      return { "x-codex-turn-metadata": meta };
    },
  };
  const deps: any = {
    randomBytes: (size: number) => {
      trace.push(["random", size]);
      return Buffer.alloc(size, 7);
    },
    setTimeout: (callback: any, delay: number) => {
      trace.push(["timer", delay]);
      timerCallback = callback;
      return 1;
    },
    clearTimeout: (id: any) => trace.push(["clear", id]),
    async connect(path: string) {
      trace.push(["connect", path]);
      if (mode === "connect-error") throw Error("connect");
      let incoming: any;
      const closed: Function[] = [];
      return {
        setMessageCallback(callback: any) {
          incoming = callback;
        },
        addCloseListener(callback: any) {
          closed.push(callback);
        },
        async close() {
          trace.push(["close"]);
          if (mode === "close-error") throw Error("close");
          for (const listener of closed) listener({ message: "closed" });
        },
        sendMessage(message: any) {
          trace.push(["request", message]);
          if (mode === "timeout") {
            queueMicrotask(() => timerCallback());
            return;
          }
          if (mode === "rpc-error") {
            queueMicrotask(() =>
              incoming({ id: message.id, error: { message: "remote" } }),
            );
            return;
          }
          const request =
            mode === "wrong-request"
              ? { ...message.params, nonce: "wrong" }
              : message.params;
          const grant = {
            domain: mode === "wrong-domain" ? "other" : browserAccessDomain,
            request,
            allowed: mode !== "denied",
          };
          const payload =
            mode === "reordered"
              ? JSON.stringify({
                  allowed: true,
                  request,
                  domain: browserAccessDomain,
                })
              : JSON.stringify(grant);
          let response: any = {
            payload,
            signature: sign(
              null,
              Buffer.from(payload),
              keys.privateKey,
            ).toString("base64"),
          };
          if (mode === "invalid-signature")
            response.signature = Buffer.alloc(64).toString("base64");
          if (mode === "missing-signature") delete response.signature;
          if (mode === "missing-payload") delete response.payload;
          if (mode === "null-response") response = null;
          queueMicrotask(() => incoming({ id: message.id, result: response }));
        },
      };
    },
  };
  const external = {
    ice: createPublicKey,
    ace: verify,
    sce: deps.randomBytes,
    Vo: { create: deps.connect },
    TC: "BROWSER_USE_ACCESS_EXECUTOR_ID",
    EC: "BROWSER_USE_ACCESS_PIPE_PATH",
    CC: "BROWSER_USE_ACCESS_VERIFYING_IDENTITY",
    AC: "browser/access",
    PC: browserAccessDomain,
    Me: codexTurnMetadata,
    setTimeout: deps.setTimeout,
    clearTimeout: deps.clearTimeout,
  };
  const assertion = source
    ? originalServiceBindings(["to", "Gx", "uce", "H6"], external).H6(runtime)
    : createBrowserAccessVerifier(deps).createAssertion(runtime);
  if (mode === "missing-meta") meta = undefined;
  async function attempt(name: string) {
    try {
      await Promise.all([assertion(), assertion()]);
      trace.push([name, "ok"]);
    } catch (error: any) {
      trace.push([name, error instanceof Error ? error.message : error]);
    }
  }
  await attempt("first");
  runtime.env.BROWSER_USE_ACCESS_EXECUTOR_ID = "changed";
  await attempt("same turn");
  meta = { session_id: "session", turn_id: "next" };
  await attempt("next turn");
  return trace;
}
test("access assertion matches original signed-grant validation, failed-turn cache and cleanup", async () => {
  for (const mode of [
    "normal",
    "no-executor",
    "missing-meta",
    "missing-pipe",
    "missing-key",
    "bad-key",
    "connect-error",
    "close-error",
    "rpc-error",
    "timeout",
    "wrong-request",
    "wrong-domain",
    "denied",
    "reordered",
    "invalid-signature",
    "missing-signature",
    "missing-payload",
    "null-response",
  ]) {
    const actual = await run(false, mode);
    assert.deepEqual(actual, await run(true, mode), mode);
    if (mode === "normal") {
      assert.equal(actual.filter((row) => row[0] === "request").length, 2);
      assert.ok(
        actual
          .filter((row) => row[0] === "request")
          .every((row) => row[1].params.executorId === "executor"),
      );
      assert.equal(
        actual.find((row) => row[0] === "request")[1].params.sessionId,
        "session",
      );
    }
    if (mode === "reordered")
      assert.equal(
        actual.find((row) => row[0] === "first")[1],
        "Local browser use is disabled in Work settings",
      );
    if (mode === "invalid-signature")
      assert.equal(
        actual.find((row) => row[0] === "first")[1],
        "Cannot authenticate the browser access response",
      );
  }
});
test("access verification crosses a real framed Unix socket using a synthetic Ed25519 grant", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createServer, createConnection } = await import("node:net");
  const { NativePipeTransport } =
    await import("../packages/browser/src/service/runtime/native_pipe");
  const { nativePipeMessage } =
    await import("../packages/browser/src/service/runtime/native_pipe_bridge");
  const { BrowserRpcPeer } =
    await import("../packages/browser/src/service/runtime/rpc_peer");
  const root = await mkdtemp(join(tmpdir(), "cua-access-")),
    socketPath = join(root, "access.sock");
  const sockets: any[] = [];
  let calls = 0;
  const server = createServer((socket) => {
    const transport = new NativePipeTransport(socket, {
      decodeMessage: nativePipeMessage,
    });
    sockets.push(transport);
    const peer = new BrowserRpcPeer(transport);
    peer.registerRequestHandler("browser/access", (request: any) => {
      calls++;
      assert.equal(request.nonce.length, 64);
      const payload = JSON.stringify({
        domain: browserAccessDomain,
        request,
        allowed: true,
      });
      return {
        payload,
        signature: sign(null, Buffer.from(payload), keys.privateKey).toString(
          "base64",
        ),
      };
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  try {
    const verifier = createBrowserAccessVerifier({
      connect: async (path) => {
        const socket = await new Promise<any>((resolve, reject) => {
          const connection = createConnection(path);
          connection.once("connect", () => resolve(connection));
          connection.once("error", reject);
        });
        return new NativePipeTransport(socket, {
          decodeMessage: nativePipeMessage,
        });
      },
    });
    const runtime = {
      env: {
        BROWSER_USE_ACCESS_EXECUTOR_ID: "synthetic-executor",
        BROWSER_USE_ACCESS_PIPE_PATH: socketPath,
        BROWSER_USE_ACCESS_VERIFYING_IDENTITY: identity,
      },
      requestMeta: {
        "x-codex-turn-metadata": { session_id: "s", turn_id: "t" },
      },
    };
    const assertion = verifier.createAssertion(runtime);
    await Promise.all([assertion(), assertion()]);
    await assertion();
    assert.equal(calls, 1);
    runtime.requestMeta["x-codex-turn-metadata"].turn_id = "next";
    await assertion();
    assert.equal(calls, 2);
  } finally {
    await Promise.all(sockets.map((socket) => socket.close()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

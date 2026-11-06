import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type Socket } from "node:net";
import { mkdtemp, mkdir, chmod, writeFile, rm, realpath } from "node:fs/promises";
import { assertPrivateEndpointDirectory } from "./endpoint_configuration";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Readable, Writable } from "node:stream";
import {
  NativePipeFrameDecoder,
  encodeNativePipeFrame,
} from "@core/browser/nativePipe";
import { NativeHostRouter } from "./router";
import type { NativeHostLifecycleEvent } from "./lifecycle_log";
import { MAX_FRAME, type NativeHostEndpoint } from "./protocol";
export { MAX_FRAME, type NativeHostEndpoint } from "./protocol";
/** @deprecated Legacy TS reference server. Production callers use startRustNativeHost.
 * Local capability authentication is specific to @core. Original host is untouched. */
export async function startNativeHost(
  input: Readable,
  output: Writable,
  options: { requestTimeoutMs?: number; parentDirectory?: string; onLifecycle?: (event: NativeHostLifecycleEvent) => void } = {},
) {
  const report = (event: NativeHostLifecycleEvent) => {
    try { options.onLifecycle?.(event); } catch { /* Diagnostics cannot interrupt transport cleanup. */ }
  };
  if (options.parentDirectory !== undefined) {
    await mkdir(options.parentDirectory, { recursive: true, mode: 0o700 });
    await assertPrivateEndpointDirectory(options.parentDirectory);
  }
  const directory = await realpath(await mkdtemp(
    join(options.parentDirectory ?? tmpdir(), "core-cua-"),
  ));
  await chmod(directory, 0o700);
  const endpoint: NativeHostEndpoint = {
    version: 1,
    socketPath: join(directory, "host.sock"),
    token: randomBytes(32).toString("hex"),
  };
  const sockets = new Set<Socket>();
  const router = new NativeHostRouter((message) => {
    if (output.destroyed || output.writableLength > 4 * MAX_FRAME)
      throw Error("Extension output unavailable or overloaded");
    output.write(encodeNativePipeFrame(JSON.stringify(message), MAX_FRAME));
  }, options.requestTimeoutMs);
  const server = createServer((socket) => {
    sockets.add(socket);
    const id = randomUUID();
    let authorized = false;
    const decoder = new NativePipeFrameDecoder(MAX_FRAME);
    const authTimeout = setTimeout(() => socket.destroy(), 5000);
    authTimeout.unref();
    const send = (message: unknown) => {
      if (socket.destroyed || socket.writableLength > 4 * MAX_FRAME) {
        socket.destroy();
        return;
      }
      socket.write(encodeNativePipeFrame(JSON.stringify(message), MAX_FRAME));
    };
    socket.on("data", (bytes: Buffer) => {
      try {
        for (const frame of decoder.push(bytes)) {
          const message = JSON.parse(frame);
          if (!authorized) {
            const supplied =
              typeof message?.token === "string"
                ? Buffer.from(message.token)
                : Buffer.alloc(0);
            const expected = Buffer.from(endpoint.token);
            if (
              message?.type !== "core-cua-auth" ||
              message.version !== 1 ||
              supplied.length !== expected.length ||
              !timingSafeEqual(supplied, expected)
            ) {
              socket.destroy();
              return;
            }
            authorized = true;
            clearTimeout(authTimeout);
            router.addClient(id, send);
            send({ type: "core-cua-auth-ok", version: 1 });
          } else router.fromClient(id, message);
        }
      } catch {
        socket.destroy();
      }
    });
    socket.on("error", () => {});
    socket.on("close", () => {
      clearTimeout(authTimeout);
      try {
        router.removeClient(id);
      } catch {
        void close("client-cleanup-error");
      }
      sockets.delete(socket);
    });
  });
  let closing: Promise<void> | undefined;
  const close = (reason: NativeHostLifecycleEvent = "explicit-close") =>
    (closing ??= (async () => {
      report(reason);
      input.removeListener("data", onData);
      input.removeListener("end", onEnd);
      input.removeListener("error", onInputError);
      output.removeListener("error", onOutputError);
      router.close();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    })());
  const onEnd = () => {
    void close("input-ended");
  };
  const onInputError = () => { void close("input-error"); };
  const onOutputError = () => { void close("output-error"); };
  const decoder = new NativePipeFrameDecoder(MAX_FRAME);
  const onData = (bytes: Buffer) => {
    try {
      for (const frame of decoder.push(bytes))
        router.fromExtension(JSON.parse(frame));
    } catch {
      void close("invalid-extension-message");
    }
  };
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(endpoint.socketPath, () => {
        server.removeListener("error", reject);
        resolve();
      });
    });
    await chmod(endpoint.socketPath, 0o600);
    await writeFile(
      join(directory, "endpoint.json"),
      JSON.stringify(endpoint),
      { mode: 0o600 },
    );
    server.on("error", () => { void close("server-error"); });
    input.on("data", onData);
    input.once("end", onEnd);
    input.once("error", onInputError);
    output.once("error", onOutputError);
    report("ready");
    return { endpoint, endpointFile: join(directory, "endpoint.json"), close };
  } catch (error) {
    await close();
    throw error;
  }
}

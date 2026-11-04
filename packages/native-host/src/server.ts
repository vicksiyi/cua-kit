import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type Socket } from "node:net";
import { mkdtemp, chmod, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Readable, Writable } from "node:stream";
import {
  NativePipeFrameDecoder,
  encodeNativePipeFrame,
} from "@core/browser/nativePipe";
import { NativeHostRouter } from "./router";
export const MAX_FRAME = 1024 * 1024;
export interface NativeHostEndpoint {
  version: 1;
  socketPath: string;
  token: string;
}
/** Local capability authentication is specific to @core. Original host is untouched. */
export async function startNativeHost(
  input: Readable,
  output: Writable,
  options: { requestTimeoutMs?: number } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), "core-cua-"));
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
        void close();
      }
      sockets.delete(socket);
    });
  });
  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= (async () => {
      input.removeListener("data", onData);
      input.removeListener("end", onEnd);
      input.removeListener("error", onEnd);
      output.removeListener("error", onEnd);
      router.close();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    })());
  const onEnd = () => {
    void close();
  };
  const decoder = new NativePipeFrameDecoder(MAX_FRAME);
  const onData = (bytes: Buffer) => {
    try {
      for (const frame of decoder.push(bytes))
        router.fromExtension(JSON.parse(frame));
    } catch {
      void close();
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
    server.on("error", onEnd);
    input.on("data", onData);
    input.once("end", onEnd);
    input.once("error", onEnd);
    output.once("error", onEnd);
    return { endpoint, endpointFile: join(directory, "endpoint.json"), close };
  } catch (error) {
    await close();
    throw error;
  }
}

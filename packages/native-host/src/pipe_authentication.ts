import { endianness } from "node:os";
import {
  encodeNativePipeFrame,
  type NativePipeSocket,
} from "@core/browser/nativePipe";
import type { NativeHostEndpoint } from "./protocol";
import { MAX_FRAME } from "./protocol";

/** Authenticate over the privileged worker pipe while retaining its execution-context delivery.
 * A raw Node socket captures the setup call's async context and cannot replace this bridge.
 */
export async function authenticateNativeHostPipe(
  endpoint: NativeHostEndpoint,
  connect: (path: string) => Promise<NativePipeSocket>,
): Promise<NativePipeSocket> {
  const socket = await connect(endpoint.socketPath);
  const listeners = new Map<string, Set<(value?: any) => void>>();
  let authenticated = false;
  let closed = false;
  let terminalError: Error | undefined;
  let buffered = Buffer.alloc(0);
  const queued: Buffer[] = [];
  let queuedBytes = 0;
  const emit = (event: string, value?: any) => {
    for (const listener of listeners.get(event) ?? []) listener(value);
  };
  const deliver = (bytes: Buffer) => {
    if (!bytes.length) return;
    if (listeners.get("data")?.size) emit("data", bytes);
    else {
      queuedBytes += bytes.length;
      if (queuedBytes > MAX_FRAME)
        throw Error("Native host buffered data exceeds limit");
      queued.push(bytes);
    }
  };
  const pipe: NativePipeSocket = {
    on(event, listener) {
      const callbacks = listeners.get(event) ?? new Set();
      callbacks.add(listener);
      listeners.set(event, callbacks);
      if (event === "data")
        queueMicrotask(() => {
          while (queued.length) emit("data", queued.shift());
          queuedBytes = 0;
        });
      if (event === "error" && terminalError)
        queueMicrotask(() => listener(terminalError));
      if (event === "close" && closed) queueMicrotask(() => listener());
    },
    write: (bytes) => socket.write(bytes),
    end: () => socket.end(),
  };
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => fail(Error("Native host authentication timed out")),
      5000,
    );
    const fail = (error: Error) => {
      clearTimeout(timer);
      terminalError = error;
      if (!authenticated) reject(error);
      else emit("error", error);
      socket.end();
    };
    socket.on("error", (error) =>
      fail(error instanceof Error ? error : Error(String(error))),
    );
    socket.on("close", () => {
      closed = true;
      clearTimeout(timer);
      if (!authenticated)
        reject(Error("Native host closed before authentication"));
      emit("close");
    });
    socket.on("data", (bytes) => {
      try {
        if (authenticated) {
          deliver(Buffer.from(bytes));
          return;
        }
        buffered = Buffer.concat([buffered, bytes]);
        if (buffered.length < 4) return;
        const length =
          endianness() === "LE"
            ? buffered.readUInt32LE(0)
            : buffered.readUInt32BE(0);
        if (length > MAX_FRAME)
          throw Error("Authentication frame exceeds limit");
        if (buffered.length < length + 4) return;
        const response = JSON.parse(
          buffered.subarray(4, length + 4).toString("utf8"),
        );
        if (response.type !== "core-cua-auth-ok" || response.version !== 1)
          throw Error("Invalid authentication response");
        deliver(buffered.subarray(length + 4));
        authenticated = true;
        clearTimeout(timer);
        buffered = Buffer.alloc(0);
        resolve();
      } catch (error) {
        fail(error instanceof Error ? error : Error(String(error)));
      }
    });
    try {
      socket.write(
        encodeNativePipeFrame(
          JSON.stringify({ type: "core-cua-auth", ...endpoint }),
          MAX_FRAME,
        ),
      );
    } catch (error) {
      fail(error instanceof Error ? error : Error(String(error)));
    }
  });
  return pipe;
}

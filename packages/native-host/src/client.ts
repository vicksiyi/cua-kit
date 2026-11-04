import { createConnection } from "node:net";
import { endianness } from "node:os";
import {
  NativePipeTransport,
  encodeNativePipeFrame,
} from "@core/browser/nativePipe";
import type { NativeHostEndpoint } from "./server";
import { MAX_FRAME } from "./server";
import { rpcMessage } from "./router";
/** Authenticate before exposing the original BrowserRpcTransport contract. */
export async function connectNativeHost(
  endpoint: NativeHostEndpoint,
): Promise<NativePipeTransport> {
  if (endpoint.version !== 1 || !endpoint.socketPath || !endpoint.token)
    throw Error("Invalid @core host endpoint");
  const socket = createConnection(endpoint.socketPath);
  try {
    await new Promise<void>((resolve, reject) => {
      let received = Buffer.alloc(0);
      const timer = setTimeout(
        () => finish(Error("Native host authentication timed out")),
        5000,
      );
      const onError = (error: Error) => finish(error);
      const onClose = () =>
        finish(Error("Native host closed before authentication"));
      const finish = (error?: Error) => {
        clearTimeout(timer);
        socket.removeListener("data", onData);
        socket.removeListener("error", onError);
        socket.removeListener("close", onClose);
        error ? reject(error) : resolve();
      };
      const onData = (bytes: Buffer) => {
        try {
          received = Buffer.concat([received, bytes]);
          if (received.length < 4) return;
          const length =
            endianness() === "LE"
              ? received.readUInt32LE(0)
              : received.readUInt32BE(0);
          if (length > MAX_FRAME)
            throw Error("Authentication frame exceeds limit");
          if (received.length < length + 4) return;
          const response = JSON.parse(
            received.subarray(4, length + 4).toString("utf8"),
          );
          if (response.type !== "core-cua-auth-ok" || response.version !== 1)
            throw Error("Invalid authentication response");
          socket.pause();
          const remaining = received.subarray(length + 4);
          finish();
          if (remaining.length) socket.unshift(remaining);
        } catch (error) {
          finish(error instanceof Error ? error : Error(String(error)));
        }
      };
      socket.on("error", onError);
      socket.on("close", onClose);
      socket.on("data", onData);
      socket.once("connect", () =>
        socket.write(
          encodeNativePipeFrame(
            JSON.stringify({ type: "core-cua-auth", ...endpoint }),
            MAX_FRAME,
          ),
        ),
      );
    });
    const transport = new NativePipeTransport(socket, {
      decodeMessage: rpcMessage,
      maxFrameBytes: MAX_FRAME,
    });
    // Allow caller to register RPC handlers before queued data is delivered.
    setImmediate(() => socket.resume());
    return transport;
  } catch (error) {
    socket.destroy();
    throw error;
  }
}

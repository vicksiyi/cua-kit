import { Buffer } from "node:buffer";
import { endianness } from "node:os";
const headerBytes = 4;
export class NativePipeFrameLimitError extends Error {
  constructor(
    public messageBytes: number,
    public maxFrameBytes: number,
  ) {
    super("native pipe message exceeds frame limit");
  }
}
export function encodeNativePipeFrame(
  text: string,
  maxFrameBytes = 4294967295,
) {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length > maxFrameBytes)
    throw new NativePipeFrameLimitError(bytes.length, maxFrameBytes);
  const frame = Buffer.alloc(headerBytes + bytes.length);
  if (endianness() === "LE") frame.writeUInt32LE(bytes.length, 0);
  else frame.writeUInt32BE(bytes.length, 0);
  bytes.copy(frame, headerBytes);
  return frame;
}
/** Original ab: native-endian length prefix, incremental chunks and optional exactly-one frame. */
export class NativePipeFrameDecoder {
  chunks: Buffer[] = [];
  byteLength = 0;
  chunkStart = 0;
  responseReceived = false;
  constructor(
    public maxFrameBytes = 4294967295,
    public singleResponse = false,
  ) {}
  push(bytes: Uint8Array) {
    if (this.singleResponse && this.responseReceived && bytes.byteLength !== 0)
      throw Error("native pipe expected one response frame");
    this.append(bytes);
    const messages: string[] = [];
    while (this.byteLength >= headerBytes) {
      const prefix = this.peekBytes(headerBytes),
        length =
          endianness() === "LE"
            ? prefix.readUInt32LE(0)
            : prefix.readUInt32BE(0);
      if (length > this.maxFrameBytes)
        throw Error("native pipe frame exceeds limit");
      const frameLength = headerBytes + length;
      if (this.byteLength < frameLength) break;
      messages.push(
        this.consumeBytes(frameLength).subarray(headerBytes).toString("utf8"),
      );
    }
    if (this.singleResponse && messages.length > 0) {
      if (messages.length !== 1 || this.byteLength !== 0)
        throw Error("native pipe expected one response frame");
      this.responseReceived = true;
    }
    return messages;
  }
  append(bytes: Uint8Array) {
    if (bytes.byteLength === 0) return;
    const chunk = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.chunks.push(chunk);
    this.byteLength += chunk.byteLength;
  }
  peekBytes(length: number) {
    const first = this.chunks[this.chunkStart];
    if (first && first.byteLength >= length) return first.subarray(0, length);
    const result = Buffer.allocUnsafe(length);
    let offset = 0;
    for (let index = this.chunkStart; index < this.chunks.length; index++) {
      const chunk = this.chunks[index];
      if (!chunk) throw Error("native pipe frame decoder underflow");
      offset += chunk.copy(result, offset, 0, length - offset);
      if (offset === length) break;
    }
    return result;
  }
  consumeBytes(length: number) {
    const first = this.chunks[this.chunkStart];
    if (first && first.byteLength >= length) {
      const result = first.subarray(0, length);
      if (first.byteLength === length) this.discardFirstChunk();
      else this.chunks[this.chunkStart] = first.subarray(length);
      this.byteLength -= length;
      return result;
    }
    const result = Buffer.allocUnsafe(length);
    let offset = 0;
    while (offset < length) {
      const chunk = this.chunks[this.chunkStart];
      if (!chunk) throw Error("native pipe frame decoder underflow");
      const consumed = chunk.copy(result, offset, 0, length - offset);
      offset += consumed;
      this.byteLength -= consumed;
      if (consumed === chunk.byteLength) this.discardFirstChunk();
      else this.chunks[this.chunkStart] = chunk.subarray(consumed);
    }
    return result;
  }
  discardFirstChunk() {
    this.chunkStart++;
    if (this.chunkStart === this.chunks.length) {
      this.chunks.length = 0;
      this.chunkStart = 0;
      return;
    }
    if (this.chunkStart > 1024 && this.chunkStart * 2 > this.chunks.length) {
      this.chunks.splice(0, this.chunkStart);
      this.chunkStart = 0;
    }
  }
}
export interface NativePipeSocket {
  on(event: string, callback: (value?: any) => void): unknown;
  write(bytes: Uint8Array): unknown;
  end(): unknown;
}
export interface NativePipeOptions {
  decodeMessage(message: any): any;
  maxFrameBytes?: number;
  singleResponse?: boolean;
  closedBeforeResponseMessage?: string;
  closeSocket?: () => unknown;
}
const asError = (value: unknown) =>
  value instanceof Error ? value : new Error(String(value));
/** Original cs: single-response delivery is deferred until socket close. */
export class NativePipeTransport {
  socket: NativePipeSocket | null;
  closeListeners = new Set<(error?: Error) => unknown>();
  frameDecoder: NativePipeFrameDecoder;
  messageCallback: ((message: any) => unknown) | null = null;
  closePromise: Promise<void> | null = null;
  terminalClose: { error?: Error } | null = null;
  pendingResponse: { message: any } | null = null;
  constructor(
    socket: NativePipeSocket,
    public options: NativePipeOptions,
  ) {
    this.socket = socket;
    this.frameDecoder = new NativePipeFrameDecoder(
      options.maxFrameBytes,
      options.singleResponse,
    );
    const captured = this.socket;
    if (captured != null) {
      captured.on("data", (bytes) => {
        if (this.socket === captured) this.handleData(bytes);
      });
      captured.on("error", (error) => {
        if (this.socket === captured) this.close(error);
      });
      captured.on("close", () => {
        if (this.socket === captured) {
          if (this.pendingResponse != null) {
            try {
              this.messageCallback?.(this.pendingResponse.message);
              this.markClosed();
            } catch (error) {
              this.markClosed(asError(error));
            }
            return;
          }
          this.markClosed(
            new Error(
              this.options.closedBeforeResponseMessage ??
                "native pipe closed before response",
            ),
          );
        }
      });
    }
  }
  sendMessage(message: any) {
    if (this.socket == null) throw Error("native pipe is closed");
    this.socket.write(
      encodeNativePipeFrame(
        JSON.stringify(message),
        this.options.maxFrameBytes,
      ),
    );
  }
  setMessageCallback(callback: (message: any) => unknown) {
    this.messageCallback = callback;
  }
  addCloseListener(listener: (error?: Error) => unknown) {
    this.closeListeners.add(listener);
    if (this.terminalClose != null)
      Promise.resolve()
        .then(() => listener(this.terminalClose?.error))
        .catch(() => {});
    return () => {
      this.closeListeners.delete(listener);
    };
  }
  isClosed() {
    return this.terminalClose != null;
  }
  async close(error?: Error) {
    this.closePromise ??= (async () => {
      const socket = this.socket;
      await this.markClosed(error);
      if (socket != null)
        try {
          if (this.options.closeSocket != null) this.options.closeSocket();
          else socket.end();
        } catch {}
    })();
    await this.closePromise;
  }
  handleData(bytes: Uint8Array) {
    try {
      for (const frame of this.frameDecoder.push(bytes)) {
        const message = this.options.decodeMessage(JSON.parse(frame));
        if (message !== undefined) {
          if (this.options.singleResponse) this.pendingResponse = { message };
          else this.messageCallback?.(message);
        }
      }
    } catch (error) {
      this.close(asError(error));
    }
  }
  async markClosed(error?: Error) {
    if (this.terminalClose == null) {
      this.terminalClose = { error };
      this.socket = null;
      this.pendingResponse = null;
      await Promise.allSettled(
        [...this.closeListeners].map(async (listener) => listener(error)),
      );
    }
  }
}

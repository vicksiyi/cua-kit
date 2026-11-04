import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { authenticateNativeHostPipe } from "../packages/native-host/src/pipe_authentication";
import {
  encodeNativePipeFrame,
  NativePipeFrameDecoder,
} from "../packages/browser/src/service/runtime/native_pipe";

const endpoint = {
  version: 1 as const,
  socketPath: "/test/socket",
  token: "a".repeat(64),
};
class Pipe extends EventEmitter {
  writes: Buffer[] = [];
  ended = false;
  write(bytes: Uint8Array) {
    this.writes.push(Buffer.from(bytes));
  }
  end() {
    this.ended = true;
    queueMicrotask(() => this.emit("close"));
  }
}

test("privileged pipe authentication consumes only ack and preserves coalesced notifications", async () => {
  const raw = new Pipe();
  const promise = authenticateNativeHostPipe(endpoint, async () => raw);
  await new Promise((resolve) => setImmediate(resolve));
  const auth = JSON.parse(new NativePipeFrameDecoder().push(raw.writes[0])[0]);
  assert.equal(auth.type, "core-cua-auth");
  assert.equal(auth.token, endpoint.token);
  const ack = encodeNativePipeFrame(
    JSON.stringify({ type: "core-cua-auth-ok", version: 1 }),
  );
  const notice = encodeNativePipeFrame(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "onCDPEvent",
      params: { method: "Fetch.requestPaused" },
    }),
  );
  raw.emit("data", ack.subarray(0, 2));
  raw.emit("data", Buffer.concat([ack.subarray(2), notice]));
  const pipe = await promise;
  const received: Buffer[] = [];
  pipe.on("data", (bytes) => received.push(bytes));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(Buffer.concat(received), notice);
  const next = Buffer.from([1, 2, 3]);
  raw.emit("data", next);
  assert.deepEqual(received[1], next);
  pipe.write(next);
  assert.deepEqual(raw.writes[1], next);
  pipe.end();
  assert.equal(raw.ended, true);
});

for (const failure of ["invalid-ack", "close"] as const)
  test(`privileged auth fails closed: ${failure}`, async () => {
    const raw = new Pipe();
    const promise = authenticateNativeHostPipe(endpoint, async () => raw);
    const rejected = assert.rejects(promise, /authentication/i);
    await new Promise((resolve) => setImmediate(resolve));
    if (failure === "close") raw.end();
    else
      raw.emit(
        "data",
        encodeNativePipeFrame(JSON.stringify({ type: "wrong", version: 1 })),
      );
    await rejected;
    assert.equal(raw.ended, true);
  });

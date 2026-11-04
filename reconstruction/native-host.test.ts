import assert from "node:assert/strict";
import test from "node:test";
import { PassThrough } from "node:stream";
import { stat, access } from "node:fs/promises";
import { startNativeHost } from "../packages/native-host/src/server";
import { connectNativeHost } from "../packages/native-host/src/client";
import {
  NativePipeFrameDecoder,
  encodeNativePipeFrame,
} from "../packages/browser/src/service/runtime/native_pipe";
import { BrowserRpcPeer } from "../packages/core/src/browser_rpc_peer";
import { ExtensionBrowserPeer } from "../packages/browser-extension/src/browser_peer";

test("real Unix socket routes colliding RPC ids to two clients through restored extension peer", async (t) => {
  const input = new PassThrough(),
    output = new PassThrough();
  const decoder = new NativePipeFrameDecoder();
  let callback: (message: any) => void = () => {};
  const extension = new ExtensionBrowserPeer(
    {
      setMessageCallback(fn) {
        callback = fn;
      },
      sendMessage(message) {
        const frame = encodeNativePipeFrame(JSON.stringify(message));
        input.write(frame.subarray(0, 2));
        input.write(frame.subarray(2));
      },
    },
    {
      moveMouse() {},
      async getInfo(params: any) {
        await new Promise((resolve) => setTimeout(resolve, params.delay));
        return { type: "extension", session: params.session_id };
      },
    },
  );
  output.on("data", (bytes) => {
    for (const frame of decoder.push(bytes)) callback(JSON.parse(frame));
  });
  const host = await startNativeHost(input, output);
  t.after(() => host.close());
  assert.equal((await stat(host.endpointFile)).mode & 0o777, 0o600);
  assert.equal((await stat(host.endpoint.socketPath)).mode & 0o777, 0o600);
  await assert.rejects(
    connectNativeHost({ ...host.endpoint, token: "invalid" }),
    /closed/,
  );
  const transports = await Promise.all([
    connectNativeHost(host.endpoint),
    connectNativeHost(host.endpoint),
  ]);
  const peers = transports.map((transport) => new BrowserRpcPeer(transport));
  const results = await Promise.all(
    peers.map((peer, i) =>
      peer.sendRequest("getInfo", {
        session_id: `s${i}`,
        delay: i === 0 ? 20 : 0,
      }),
    ),
  );
  assert.deepEqual(results, [
    { type: "extension", session: "s0" },
    { type: "extension", session: "s1" },
  ]);
  const events = peers.map(
    (peer) =>
      new Promise((resolve) => peer.addEventListener("onCDPEvent", resolve)),
  );
  extension.sendCdpEvent({ method: "Page.loadEventFired" });
  assert.deepEqual(await Promise.all(events), [
    { method: "Page.loadEventFired" },
    { method: "Page.loadEventFired" },
  ]);
  await assert.rejects(peers[0].sendRequest("notImplemented"), /No handler/);
  await host.close();
  await assert.rejects(access(host.endpointFile));
  await Promise.all(transports.map((transport) => transport.close()));
});

test("host shutdown rejects in-flight RPC and removes private endpoint", async (t) => {
  const input = new PassThrough(),
    output = new PassThrough();
  const host = await startNativeHost(input, output);
  t.after(() => host.close());
  const transport = await connectNativeHost(host.endpoint);
  const peer = new BrowserRpcPeer(transport);
  const failure = assert.rejects(peer.sendRequest("getInfo", {}), /closed/);
  input.end();
  await failure;
  await host.close();
  await assert.rejects(access(host.endpointFile));
});

test("unanswered extension request times out and later responses cannot be rerouted", async (t) => {
  const input = new PassThrough(),
    output = new PassThrough();
  const host = await startNativeHost(input, output, { requestTimeoutMs: 10 });
  t.after(() => host.close());
  const transport = await connectNativeHost(host.endpoint);
  const peer = new BrowserRpcPeer(transport);
  const frames: any[] = [];
  const decoder = new NativePipeFrameDecoder();
  output.on("data", (bytes) => {
    for (const frame of decoder.push(bytes)) frames.push(JSON.parse(frame));
  });
  await assert.rejects(peer.sendRequest("getInfo", {}), /timed out/);
  input.write(
    encodeNativePipeFrame(
      JSON.stringify({ jsonrpc: "2.0", id: frames[0].id, result: "late" }),
    ),
  );
  await transport.close();
});

import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import {
  mkdtemp,
  realpath,
  mkdir,
  rm,
  readdir,
  writeFile,
  chmod,
  access,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { startRustNativeHost } from "../packages/native-host/src/native_process";
import { connectNativeHost } from "../packages/native-host/src/client";
import { BrowserRpcPeer } from "../packages/core/src/browser_rpc_peer";
import { ExtensionBrowserPeer } from "../packages/browser-extension/src/browser_peer";
import {
  NativePipeFrameDecoder,
  encodeNativePipeFrame,
} from "../packages/browser/src/service/runtime/native_pipe";
const enabled =
  process.platform !== "win32" && process.env.CUA_TEST_RUST_HOST_ROUTER === "1";
const executable = resolve(
  "native/browser-extension-host/target/debug/core-browser-extension-host",
);
test(
  "Rust process binding forwards borrowed streams and reaps its owned child on close",
  { skip: !enabled, timeout: 10000 },
  async (t) => {
    const parent = await realpath(await mkdtemp("/tmp/cua-process-test-"));
    t.after(() => rm(parent, { recursive: true, force: true }));
    const input = new PassThrough(),
      output = new PassThrough();
    let callback: (message: any) => void = () => {};
    new ExtensionBrowserPeer(
      {
        setMessageCallback(fn) {
          callback = fn;
        },
        sendMessage(message) {
          input.write(encodeNativePipeFrame(JSON.stringify(message)));
        },
      },
      {
        getInfo() {
          return { marker: "rust-process-binding" };
        },
      } as any,
    );
    const decoder = new NativePipeFrameDecoder();
    output.on("data", (bytes) => {
      for (const frame of decoder.push(bytes)) callback(JSON.parse(frame));
    });
    const baseline = [
      input.listenerCount("error"),
      output.listenerCount("error"),
    ];
    const host = await startRustNativeHost(input, output, {
      parentDirectory: parent,
      executable,
    });
    t.after(() => host.close());
    assert.ok(host.processId > 0);
    process.kill(host.processId, 0);
    const transport = await connectNativeHost(host.endpoint);
    t.after(() => transport.close());
    assert.deepEqual(
      await new BrowserRpcPeer(transport).sendRequest("getInfo", {}),
      { marker: "rust-process-binding" },
    );
    await Promise.all([host.close(), host.close()]);
    assert.throws(() => process.kill(host.processId, 0), { code: "ESRCH" });
    await assert.rejects(access(host.endpointFile));
    assert.deepEqual(await readdir(parent), []);
    assert.deepEqual(
      [input.listenerCount("error"), output.listenerCount("error")],
      baseline,
    );
    assert.equal(input.destroyed, false);
    assert.equal(output.destroyed, false);
    input.destroy();
    output.destroy();
  },
);
test(
  "Rust process startup failure cleans private deployment and stream listeners",
  { skip: !enabled, timeout: 10000 },
  async (t) => {
    const parent = await realpath(await mkdtemp("/tmp/cua-process-fail-"));
    t.after(() => rm(parent, { recursive: true, force: true }));
    const input = new PassThrough(),
      output = new PassThrough();
    await assert.rejects(
      startRustNativeHost(input, output, {
        parentDirectory: parent,
        executable: "/usr/bin/false",
      }),
      /exited before ready/,
    );
    assert.deepEqual(await readdir(parent), []);
    assert.equal(input.listenerCount("error"), 0);
    assert.equal(output.listenerCount("error"), 0);
    input.destroy();
    output.destroy();
  },
);
test(
  "Rust process startup timeout terminates only the owned child and cleans its deployment",
  { skip: !enabled, timeout: 10000 },
  async (t) => {
    const root = await realpath(await mkdtemp("/tmp/cua-process-timeout-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const parent = join(root, "hosts");
    await mkdir(parent, { mode: 0o700 });
    const fixture = join(root, "no-ready");
    await writeFile(fixture, "#!/bin/sh\nexec /bin/sleep 30\n");
    await chmod(fixture, 0o700);
    const input = new PassThrough(),
      output = new PassThrough();
    await assert.rejects(
      startRustNativeHost(input, output, {
        parentDirectory: parent,
        executable: fixture,
        startupTimeoutMs: 50,
      }),
      /startup timed out/,
    );
    assert.deepEqual(await readdir(parent), []);
    assert.equal(input.listenerCount("error"), 0);
    assert.equal(output.listenerCount("error"), 0);
    input.destroy();
    output.destroy();
  },
);

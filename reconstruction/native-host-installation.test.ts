import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import {
  createNativeHostInstallation,
  registerChromeNativeHost,
  validateHostConfig,
  validateExtensionOrigin,
} from "../packages/native-host/src/installation";
import { connectNativeHost } from "../packages/native-host/src/client";
import { BrowserRpcPeer } from "../packages/core/src/browser_rpc_peer";
import {
  NativePipeFrameDecoder,
  encodeNativePipeFrame,
} from "../packages/browser/src/service/runtime/native_pipe";
const id = "abcdefghijklmnopabcdefghijklmnop";

test("configuration rejects absent, wildcard and unregistered origins", () => {
  for (const extensionIds of [[], ["*"], ["wrong"], ["q".repeat(32)]])
    assert.throws(() => validateHostConfig({ version: 1, extensionIds }));
  const config = validateHostConfig({ version: 1, extensionIds: [id, id] });
  assert.equal(config.extensionIds.length, 1);
  for (const origin of [
    undefined,
    "https://example.com",
    `chrome-extension://${id}`,
    `chrome-extension://${"a".repeat(32)}/`,
  ])
    assert.throws(() => validateExtensionOrigin(config, origin));
  validateExtensionOrigin(config, `chrome-extension://${id}/`);
});

test(
  "built host launcher handles framed RPC in a separate process and exits on EOF",
  { timeout: 10000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "core-host-install-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const installation = await createNativeHostInstallation({
      parentDirectory: join(root, "space and 'quote"),
      nodePath: process.execPath,
      entryPath: resolve("packages/native-host/dist/main.mjs"),
      extensionIds: [id],
    });
    const manifest = await registerChromeNativeHost(
      installation,
      root,
      "darwin",
    );
    assert.deepEqual(
      JSON.parse(await readFile(manifest, "utf8")),
      installation.manifest,
    );
    await assert.rejects(
      registerChromeNativeHost(installation, root, "darwin"),
      { code: "EEXIST" },
    );
    const rejected = spawn(
      installation.launcherPath,
      ["chrome-extension://wrong/"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let rejectedOutput = "";
    rejected.stdout.on("data", (data) => (rejectedOutput += data));
    const rejectedExit = await once(rejected, "exit");
    assert.equal(rejectedExit[0], 1);
    assert.equal(rejectedOutput, "");
    const child = spawn(
      installation.launcherPath,
      [`chrome-extension://${id}/`],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    t.after(() => {
      if (child.exitCode === null) child.kill();
    });
    const exit = once(child, "exit");
    const endpointFile = await new Promise<string>((resolve, reject) => {
      let stderr = "";
      child.once("error", reject);
      child.stderr.on("data", (bytes) => {
        stderr += bytes;
        const match = stderr.match(/@core native host endpoint: (.+)\n/);
        if (match) resolve(match[1]);
      });
      child.once("exit", () => reject(Error("Host exited before ready")));
    });
    const endpoint = JSON.parse(await readFile(endpointFile, "utf8"));
    const decoder = new NativePipeFrameDecoder();
    child.stdout.on("data", (bytes) => {
      for (const frame of decoder.push(bytes)) {
        const request = JSON.parse(frame);
        assert.equal(request.method, "getInfo");
        child.stdin.write(
          encodeNativePipeFrame(
            JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              result: { type: "extension", fixture: true },
            }),
          ),
        );
      }
    });
    const transport = await connectNativeHost(endpoint);
    const peer = new BrowserRpcPeer(transport);
    assert.deepEqual(await peer.sendRequest("getInfo", {}), {
      type: "extension",
      fixture: true,
    });
    await transport.close();
    child.stdin.end();
    assert.equal((await exit)[0], 0);
    await assert.rejects(readFile(endpointFile), { code: "ENOENT" });
  },
);

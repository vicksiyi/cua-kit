import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdtemp,
  realpath,
  readFile,
  writeFile,
  rm,
  mkdir,
  access,
  stat,
  readdir,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  createNativeHostInstallation,
  chromeExtensionId,
  registerNativeHostForProfile,
  HOST_NAME,
} from "../packages/native-host/src/installation";
import { checkNativeHostInstallation } from "../packages/native-host/src/installation_check";
import { connectNativeHost } from "../packages/native-host/src/client";
import { BrowserRpcPeer } from "../packages/core/src/browser_rpc_peer";
import { ExtensionBrowserPeer } from "../packages/browser-extension/src/browser_peer";
import {
  encodeNativePipeFrame,
  NativePipeFrameDecoder,
} from "../packages/browser/src/service/runtime/native_pipe";
const enabled =
  process.platform !== "win32" && process.env.CUA_TEST_RUST_HOST_ROUTER === "1";
const cli = resolve("packages/native-host/dist/install.mjs");
async function fixture(t: any) {
  const temporary = await realpath(await mkdtemp("/tmp/cua-ri-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = join(temporary, "owner's root"),
    profile = join(temporary, "profile");
  await mkdir(root, { mode: 0o700 });
  const manifest = JSON.parse(
    await readFile(
      resolve("packages/browser-extension/dist/native-extension/manifest.json"),
      "utf8",
    ),
  );
  return { root, profile, id: chromeExtensionId(manifest.key) };
}
function install(root: string, profile: string) {
  return spawnSync(
    process.execPath,
    [cli, "--root", root, "--profile", profile],
    { encoding: "utf8", timeout: 10000 },
  );
}
for (const legacy of [false, true])
  test(
    `isolated installer ${legacy ? "upgrades owned legacy registration" : "creates native registration"} and launcher executes Rust`,
    { skip: !enabled, timeout: 20000 },
    async (t) => {
      const { root, profile, id } = await fixture(t);
      const endpoints = join(root, "endpoints");
      let previous: string | undefined,
        oldLauncher: string | undefined,
        oldContents: string | undefined;
      if (legacy) {
        await mkdir(endpoints, { mode: 0o700 });
        const old = await createNativeHostInstallation({
          parentDirectory: root,
          nodePath: process.execPath,
          entryPath: resolve("packages/native-host/dist/main.mjs"),
          extensionIds: [id],
          endpointParentDirectory: endpoints,
        });
        await registerNativeHostForProfile(old, profile);
        oldLauncher = old.launcherPath;
        oldContents = await readFile(oldLauncher, "utf8");
        previous = await readFile(
          join(profile, "NativeMessagingHosts", `${HOST_NAME}.json`),
          "utf8",
        );
      }
      const result = install(root, profile);
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0, result.stderr);
      const registration = join(
        profile,
        "NativeMessagingHosts",
        `${HOST_NAME}.json`,
      );
      const registered = await readFile(registration, "utf8");
      const manifest = JSON.parse(registered);
      const directory = dirname(manifest.path);
      const config = JSON.parse(
        await readFile(join(directory, "config.json"), "utf8"),
      );
      assert.equal(config.runtime.kind, "rust");
      assert.equal(
        config.runtime.executablePath,
        await realpath(
          resolve(
            "native/browser-extension-host/dist/core-browser-extension-host",
          ),
        ),
      );
      assert.doesNotMatch(await readFile(manifest.path, "utf8"), /main\.mjs/);
      if (legacy) {
        assert.notEqual(manifest.path, oldLauncher);
        assert.equal(await readFile(oldLauncher!, "utf8"), oldContents);
        assert.equal(
          await readFile(join(directory, "previous-registration.json"), "utf8"),
          previous,
        );
      }
      const before = await readdir(root);
      const again = install(root, profile);
      assert.equal(again.status, 0, again.stderr);
      assert.equal(await readFile(registration, "utf8"), registered);
      assert.deepEqual(await readdir(root), before);
      await checkNativeHostInstallation({
        manifestPath: registration,
        extensionId: id,
        endpointDirectory: endpoints,
      });
      const child = spawn(manifest.path, [`chrome-extension://${id}/`], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      const closed = new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", resolve);
      });
      t.after(async () => {
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGKILL");
        await closed;
      });
      let stderr = "";
      let readyResolve!: (file: string) => void;
      const ready = new Promise<string>((resolve) => (readyResolve = resolve));
      child.stderr.on("data", (bytes) => {
        stderr += bytes.toString();
        const match = stderr.match(/@core native host endpoint: ([^\r\n]+)/);
        if (match) readyResolve(match[1]);
      });
      let callback: (message: any) => void = () => {};
      new ExtensionBrowserPeer(
        {
          setMessageCallback(fn) {
            callback = fn;
          },
          sendMessage(message) {
            child.stdin.write(encodeNativePipeFrame(JSON.stringify(message)));
          },
        },
        {
          getInfo() {
            return { marker: "installed-rust-host" };
          },
        } as any,
      );
      const decoder = new NativePipeFrameDecoder();
      child.stdout.on("data", (bytes) => {
        for (const frame of decoder.push(bytes)) callback(JSON.parse(frame));
      });
      const file = await Promise.race([
        ready,
        closed.then(() => {
          throw Error("Installed Rust launcher exited before ready");
        }),
      ]);
      const endpoint = JSON.parse(await readFile(file, "utf8"));
      const transport = await connectNativeHost(endpoint);
      t.after(() => transport.close());
      assert.deepEqual(
        await new BrowserRpcPeer(transport).sendRequest("getInfo", {}),
        { marker: "installed-rust-host" },
      );
      child.stdin.end();
      assert.equal(await closed, 0, stderr);
      await assert.rejects(access(file));
      const logPath = join(directory, "lifecycle.jsonl");
      const contents = await readFile(logPath, "utf8");
      const rows = contents
        .trim()
        .split("\n")
        .map((row) => JSON.parse(row));
      assert.deepEqual(
        rows.map((row) => row.event),
        ["starting", "ready", "input-ended"],
      );
      assert.equal((await stat(logPath)).mode & 0o777, 0o600);
      assert.equal(contents.includes(endpoint.token), false);
      assert.equal(contents.includes("installed-rust-host"), false);
      const incompatible = JSON.stringify({
        ...manifest,
        name: "unrelated.host",
      });
      await writeFile(registration, incompatible);
      const refused = install(root, profile);
      assert.notEqual(refused.status, 0);
      assert.equal(await readFile(registration, "utf8"), incompatible);
    },
  );

import { PassThrough } from "node:stream";
import { dirname } from "node:path";
import { UnixNativePipeHost } from "../packages/runtime-supervisor/src/native-pipe-host";
import { startNativeHost } from "../packages/native-host/src/server";
import { NativePipeFrameDecoder, encodeNativePipeFrame } from "../packages/browser/src/service/runtime/native_pipe";
import { ExtensionBrowserPeer } from "../packages/browser-extension/src/browser_peer";
import test from "node:test";
import { stageRuntimePackages } from "../packages/agent-loop/src/runtime-packages";
import { WorkerSession } from "../packages/runtime-supervisor/src/session";
import { launchSandboxedWorker, sandboxedWorkerSpec } from "../packages/runtime-supervisor/src/sandbox-launcher";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type AddressInfo } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);

test(
  "macOS sandbox applied before worker code denies outside files, process spawn and network",
  {
    skip:
      process.platform !== "darwin" ||
      process.env.CUA_TEST_MACOS_SANDBOX !== "1",
    timeout: 15000,
  },
  async () => {
    const root = await realpath(
      await mkdtemp(join(tmpdir(), "core-seatbelt-")),
    );
    const allowed = join(root, "allowed");
    await mkdir(allowed);
    const outside = join(root, "outside.txt");
    await writeFile(outside, "fixture only");
    let connections = 0;
    const server = createServer((socket) => {
      connections++;
      socket.destroy();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const profile = `(version 1)(deny default)(allow file-read* file-write* (subpath ${JSON.stringify(allowed)}))(allow sysctl-read)(allow signal (target self))`;
    const addon = resolve("native/macos-sandbox/dist/sandbox.node");
    const code = `
 const fs=require("node:fs"),net=require("node:net"),cp=require("node:child_process");
 const apply=require(${JSON.stringify(addon)}).apply;
 apply(${JSON.stringify(profile)});
 const result={};
 fs.writeFileSync(${JSON.stringify(join(allowed, "written.txt"))},"allowed");result.allowed=fs.readFileSync(${JSON.stringify(join(allowed, "written.txt"))},"utf8");
 try{fs.readFileSync(${JSON.stringify(outside)});result.outside="unexpected";}catch(error){result.outside=error.code;}
 result.spawn=cp.spawnSync(process.execPath,["-e","process.exit(0)"]).error?.code;
 const socket=net.createConnection({host:"127.0.0.1",port:${(server.address() as AddressInfo).port}});
 const timer=setTimeout(()=>{socket.destroy();throw Error("network denial did not settle");},2000);
 socket.once("error",error=>{result.network=error.code;clearTimeout(timer);socket.destroy();console.log(JSON.stringify(result));});
 socket.once("connect",()=>{clearTimeout(timer);socket.destroy();throw Error("network unexpectedly allowed");});
 `;
    try {
      const result = await exec(process.execPath, ["-e", code], {
        cwd: allowed,
        env: { HOME: allowed, TMPDIR: allowed },
        timeout: 10000,
      });
      const observed = JSON.parse(result.stdout);
      assert.deepEqual(observed, {
        allowed: "allowed",
        outside: "EPERM",
        spawn: "EPERM",
        network: "EPERM",
      });
      assert.equal(connections, 0);
      const invalid = await exec(
        process.execPath,
        [
          "-e",
          `const a=require(${JSON.stringify(addon)});try{a.apply("not a valid profile");process.exitCode=9;}catch{console.log("rejected");}`,
        ],
        {
          cwd: allowed,
          env: { HOME: allowed, TMPDIR: allowed },
          timeout: 10000,
        },
      );
      assert.equal(invalid.stdout.trim(), "rejected");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  },
);

test(
  "sandboxed restored CUA discovers an authenticated independent native host",
  {
    skip:
      process.platform !== "darwin" ||
      process.env.CUA_TEST_MACOS_SANDBOX !== "1",
    timeout: 15000,
  },
  async (t) => {
    const root = await realpath(
      await mkdtemp("/tmp/core-workers-"),
    );
    t.after(() => rm(root, { recursive: true, force: true }));
    const kernelDir = join(root, "kernel"),
      trustedDir = join(root, "trusted"),
      codeDir = join(root, "code");
    await Promise.all([mkdir(kernelDir), mkdir(trustedDir), mkdir(codeDir)]);
    const secret = join(root, "outside.txt");
    await writeFile(secret, "fixture only");
    await writeFile(join(codeDir, "package.json"), '{"type":"module"}');
    await writeFile(
      join(codeDir, "service.js"),
      'export function handleRpc(){return "trusted fixture"}',
    );
    const workers = await realpath(resolve("packages/node-repl"));
    const dependencies = await realpath(resolve("node_modules"));
    const bootstrap = resolve(
        "packages/runtime-supervisor/dist/sandbox-bootstrap.js",
      ),
      addon = resolve("native/macos-sandbox/dist/sandbox.node");
    const policyOptions = {
      node: process.execPath, bootstrap, addon,
      entry: join(workers, "dist/kernel.js"), args: [],
      directory: kernelDir, readDirectories: [workers, dependencies, codeDir],
    };
    await assert.rejects(sandboxedWorkerSpec({ ...policyOptions,
      workerEnvironment: { NODE_OPTIONS: "--import=/tmp/untrusted.js" },
    }), /Unsupported worker environment/);
    await assert.rejects(sandboxedWorkerSpec({ ...policyOptions,
      readDirectories: [root, workers],
    }), /separate/);
    await assert.rejects(sandboxedWorkerSpec({ ...policyOptions,
      readDirectories: ["/"],
    }), /Filesystem root/);
    const spec = await sandboxedWorkerSpec(policyOptions);
    assert.equal(spec.env.PATH, undefined);
    assert.equal(spec.env.NODE_OPTIONS, undefined);
    await writeFile(join(trustedDir, "private.txt"), "trusted scratch");
    const staged = await stageRuntimePackages([resolve("packages/native-host"), resolve("packages/cua")]);
    t.after(() => staged.dispose());
    const input = new PassThrough(), output = new PassThrough();
    const frames = new NativePipeFrameDecoder();
    let receive: (value: any) => void = () => {};
    const extension = new ExtensionBrowserPeer({
      setMessageCallback(callback) { receive = callback; },
      sendMessage(message) { input.write(encodeNativePipeFrame(JSON.stringify(message))); },
    }, {
      moveMouse() {},
      getInfo() { return { type: "extension", family: "chrome", name: "Sandbox fixture browser", capabilities: { browser: [], tab: [] } }; },
      getUserTabs() { return []; },
      turnEnded() { return {}; },
    });
    output.on("data", bytes => { for (const frame of frames.push(bytes)) receive(JSON.parse(frame)); });
    const host = await startNativeHost(input, output, { parentDirectory: root });
    t.after(() => host.close());
    const pipeEvents: string[] = [];
    const session = new WorkerSession({
      services: ["fixture", "browser"],
      // Explicit test-only preferences; no host config or permission grants are fabricated in production.
      hostRequest: async message => {
        if (message.type !== "config_action") throw Error("Unsupported fixture host operation");
        if (message.action === "read_toml") return { ok: true, value: { full_cdp_access_enabled: false } };
        if (message.action === "read_config_requirements") return { ok: true, value: { requirements: {} } };
        if (message.action === "read_config") return { ok: true, value: { config: {} } };
        throw Error("Fixture configuration is read-only");
      },
      nativePipeHost: emit => {
        const pipe = new UnixNativePipeHost([host.endpoint.socketPath], emit);
        return { close: () => pipe.close(), async request(message) {
          pipeEvents.push(String(message.op));
          try { return await pipe.request(message); }
          catch (error) { pipeEvents.push(String(error)); throw error; }
        } };
      },
      launch: async () => {
        const start = (entry: string, args: string[], directory: string) => {
          return launchSandboxedWorker({
            node: process.execPath, bootstrap, addon, entry, args,
            directory, readDirectories: [workers, dependencies, codeDir, staged.root, ...(directory === trustedDir ? [dirname(host.endpointFile)] : [])],
            workerEnvironment: {
              NODE_REPL_TRUSTED_RPC_ENABLED: "1",
              NODE_REPL_TRUSTED_SERVICES: JSON.stringify({
                fixture: join(codeDir, "service.js"),
                browser: "@core/native-host/browserService",
              }),
              NODE_REPL_TRUSTED_CODE_PATHS: [codeDir, staged.root].join(":"),
              NODE_REPL_NODE_MODULE_DIRS: staged.root,
              NODE_REPL_UNTRUSTED_ENV_ALLOWLIST: "CUA_REPL_ENABLED_SURFACES,CUA_REPL_BROWSER_ENV",
              CUA_REPL_ENABLED_SURFACES: "browser",
              CUA_REPL_BROWSER_ENV: "codex-app",
              ...(directory === trustedDir ? {
                CORE_CUA_ENDPOINT_FILES: JSON.stringify([host.endpointFile]),
                BROWSER_USE_BACKEND_PATHS: host.endpoint.socketPath,
                BROWSER_USE_AVAILABLE_BACKENDS: "chrome",
                BROWSER_USE_DISABLE_AMBIENT_NETWORK: "1",
              } : {}),
            },
            terminateGraceMs: 20,
          });
        };
        const kernel = await start(
          join(workers, "dist/kernel.js"),
          ["--session-id", "fixture", "--working-dir", kernelDir],
          kernelDir,
        );
        try {
          return {
            kernel,
            trusted: await start(
              join(workers, "dist/trusted_worker.js"),
              [trustedDir],
              trustedDir,
            ),
          };
        } catch (error) {
          await kernel.close();
          throw error;
        }
      },
    });
    try {
      const basic = await session.execute("let x=40;nodeRepl.write(x+2)");
      assert.equal(basic.ok, true);
      assert.equal(basic.output, "42");
      const forbidden = await session.execute(
        `try{(await import("node:fs")).readFileSync(${JSON.stringify(secret)});nodeRepl.write("unexpected")}catch(error){nodeRepl.write(error.code)}`,
      );
      assert.equal(forbidden.ok, true);
      assert.equal(forbidden.output, "EPERM");
      const peer = await session.execute(
        `try{(await import("node:fs")).readFileSync(${JSON.stringify(join(trustedDir, "private.txt"))});nodeRepl.write("unexpected")}catch(error){nodeRepl.write(error.code)}`,
      );
      assert.equal(peer.output, "EPERM");
      const trusted = await session.execute(
        'nodeRepl.write(await nodeRepl.rpc("fixture",{}))',
      );
      assert.equal(trusted.ok, true, JSON.stringify(trusted));
      assert.equal(trusted.output, "trusted fixture");
      const browser = await session.execute(
        'const setup = await nodeRepl.rpc("browser",{method:"setup",params:{environment:"codex-app"}});nodeRepl.write(JSON.stringify({version:setup.credentialRecoveryErrorVersion, manifest:typeof setup.apiManifest}))',
      );
      assert.equal(browser.ok, true, JSON.stringify(browser));
      assert.deepEqual(JSON.parse(browser.output!), { version: 1, manifest: "object" });
      const cua = await session.execute(
        'await import("@core/cua/tinyskyAlt");nodeRepl.write("CUA_READY:"+typeof globalThis.cua.getTab+":"+typeof globalThis.cua.createBrowserTab)',
      );
      assert.equal(cua.ok, true, JSON.stringify(cua));
      assert.match(cua.output ?? "", /CUA_READY:function:function/);
      const discovered = await session.execute(
        'nodeRepl.write(JSON.stringify(await nodeRepl.rpc("browser", {method:"execute",params:{type:"list_browsers"}})))',
        { requestMeta: { "x-codex-turn-metadata": { session_id: "sandbox-browser", turn_id: "turn-1" } } },
      );
      assert.equal(discovered.ok, true, JSON.stringify(discovered));
      const browsers = JSON.parse(discovered.output!);
      assert.equal(browsers.length, 1, JSON.stringify({discovered, pipeEvents}));
      assert.equal(browsers[0].name, "Sandbox fixture browser");
      assert.equal(await extension.ping(), "pong");
      const capabilityRead = await session.execute(
        `try{(await import("node:fs")).readFileSync(${JSON.stringify(host.endpointFile)});nodeRepl.write("unexpected")}catch(error){nodeRepl.write(error.code)}`,
      );
      assert.equal(capabilityRead.output, "EPERM");
      const environment = await session.execute(
        "nodeRepl.write(nodeRepl.env.CORE_CUA_SANDBOX_PROFILE===undefined && nodeRepl.env.CORE_CUA_SANDBOX_ADDON===undefined)",
      );
      assert.equal(environment.output, "true");
    } finally {
      await session.close();
      await host.close();
      input.destroy(); output.destroy();
      await staged.dispose();
      await rm(root, { recursive: true, force: true });
    }
  },
);

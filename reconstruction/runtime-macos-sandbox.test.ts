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
  "restored CUA and browser service initialize under the strict sandbox launcher",
  {
    skip:
      process.platform !== "darwin" ||
      process.env.CUA_TEST_MACOS_SANDBOX !== "1",
    timeout: 15000,
  },
  async () => {
    const root = await realpath(
      await mkdtemp(join(tmpdir(), "core-isolated-workers-")),
    );
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
    const staged = await stageRuntimePackages([resolve("packages/browser-desktop"), resolve("packages/cua")]);
    const session = new WorkerSession({
      services: ["fixture", "browser"],
      launch: async () => {
        const start = (entry: string, args: string[], directory: string) => {
          return launchSandboxedWorker({
            node: process.execPath, bootstrap, addon, entry, args,
            directory, readDirectories: [workers, dependencies, codeDir, staged.root],
            workerEnvironment: {
              NODE_REPL_TRUSTED_RPC_ENABLED: "1",
              NODE_REPL_TRUSTED_SERVICES: JSON.stringify({
                fixture: join(codeDir, "service.js"),
                browser: "@core/browser-desktop/service",
              }),
              NODE_REPL_TRUSTED_CODE_PATHS: [codeDir, staged.root].join(":"),
              NODE_REPL_NODE_MODULE_DIRS: staged.root,
              NODE_REPL_UNTRUSTED_ENV_ALLOWLIST: "CUA_REPL_ENABLED_SURFACES,CUA_REPL_BROWSER_ENV",
              CUA_REPL_ENABLED_SURFACES: "browser",
              CUA_REPL_BROWSER_ENV: "codex-app",
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
      const environment = await session.execute(
        "nodeRepl.write(nodeRepl.env.CORE_CUA_SANDBOX_PROFILE===undefined && nodeRepl.env.CORE_CUA_SANDBOX_ADDON===undefined)",
      );
      assert.equal(environment.output, "true");
    } finally {
      await session.close();
      await staged.dispose();
      await rm(root, { recursive: true, force: true });
    }
  },
);

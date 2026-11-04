/** Explicit local integration probe; not included in the default synthetic suite.
 * Runs the installed supervisor under macOS network denial with isolated homes.
 * The wrapper substitutes both worker entries; it is not a supervisor port.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, writeFile, readFile, rm, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { create_launch_environment } from "../packages/cua-repl/src/launch_environment";
import path from "node:path";
import os from "node:os";
import {
  stageRuntimePackages,
  restoredPackageSources,
} from "../packages/agent-loop/src/runtime-packages";
const binary =
  process.env.CUA_NODE_REPL_BINARY ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl";
const node = path.join(path.dirname(binary), "node");
test("installed native supervisor drives restored kernel over actual MCP and routes trusted RPC after reset, timeout and cancellation", async () => {
  assert.equal(
    process.platform,
    "darwin",
    "This probe requires macOS sandbox-exec",
  );
  const manifest = JSON.parse(
    await readFile("reconstruction/node-repl-source.json", "utf8"),
  );
  assert.equal(
    createHash("sha256")
      .update(await readFile(binary))
      .digest("hex"),
    manifest.binarySha256,
    "Native probe requires the recorded supervisor build",
  );
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "cua-native-supervisor-")),
  );
  const outputs = [];
  try {
    for (const variant of ["original", "restored"]) {
      const home = path.join(root, variant);
      await import("node:fs/promises").then((fs) => fs.mkdir(home));
      const wrapper = path.join(home, "wrapper.cjs");
      const restored = path.resolve("packages/node-repl/dist/kernel.js");
      const trustedRestored = path.resolve(
        "packages/node-repl/dist/trusted_worker.js",
      );
      const service = path.join(home, "fixture.mjs");
      await writeFile(
        service,
        'export function handleRpc(request){return {value:request.value,privileged:typeof nodeRepl.config.read === "function"};}',
      );
      await writeFile(
        wrapper,
        `const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const [workerDir,node,...args]=process.argv.slice(2);const index=args.findIndex(arg=>['kernel.js','trusted-worker.js'].includes(path.basename(arg)));
if(index<0)throw Error('Unexpected worker launch');const kind=path.basename(args[index]);args[index]=kind==='kernel.js'?${JSON.stringify(restored)}:${JSON.stringify(trustedRestored)};
fs.appendFileSync(${JSON.stringify(path.join(home, "worker-kinds"))},kind+'\\n');
const child=spawn(node,args,{stdio:'inherit'});for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,()=>child.kill(signal));
child.on('error',error=>{console.error(error);process.exitCode=1});child.on('exit',(code,signal)=>{if(signal)process.kill(process.pid,signal);else process.exitCode=code??1});`,
      );
      const env: Record<string, string> = {
        HOME: home,
        CODEX_HOME: home,
        TMPDIR: home,
        PATH: "/usr/bin:/bin",
        NODE_REPL_DISABLE_ANALYTICS: "1",
        NODE_REPL_NODE_PATH: node,
        NODE_REPL_TRUSTED_SERVICES: JSON.stringify({ fixture: service }),
        NODE_REPL_TRUSTED_CODE_PATHS: home,
      };
      if (variant === "restored")
        env.NODE_REPL_WORKER_WRAPPER = JSON.stringify([node, wrapper]);
      const child = spawn(
        "/usr/bin/sandbox-exec",
        ["-p", "(version 1)(allow default)(deny network*)", binary],
        { cwd: home, env, stdio: ["pipe", "pipe", "pipe"] },
      );
      const ended = once(child, "exit");
      let stderr = "",
        buffer = "";
      let id = 0;
      const pending = new Map<
        number,
        { resolve: (r: any) => void; reject: (e: Error) => void }
      >();
      child.stderr.on("data", (b) => (stderr += b));
      child.stdout.on("data", (b) => {
        buffer += b;
        let nl;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const m = JSON.parse(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
          if (pending.has(m.id)) {
            pending.get(m.id)!.resolve(m);
            pending.delete(m.id);
          }
        }
      });
      child.on("exit", (code) => {
        for (const p of pending.values())
          p.reject(Error("Supervisor exited " + code + ": " + stderr));
        pending.clear();
      });
      const send = (m: any) =>
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
      const request = (method: string, params: any) =>
        new Promise<any>((resolve, reject) => {
          const key = ++id;
          pending.set(key, { resolve, reject });
          send({ id: key, method, params });
        });
      const timer = setTimeout(() => child.kill(), 20000);
      try {
        const init = await request("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "cua-reconstruction-probe", version: "0" },
        });
        assert.ok(init.result);
        send({ method: "notifications/initialized" });
        const listed = await request("tools/list", {});
        assert.ok(listed.result.tools.some((t: any) => t.name === "js"));
        const values = [];
        for (const [name, args] of [
          ["js", { code: "var counter=40; nodeRepl.write(counter);" }],
          ["js", { code: "counter+=2; nodeRepl.write(counter);" }],
          ["js_reset", {}],
          ["js", { code: "nodeRepl.write(typeof counter);" }],
          [
            "js",
            {
              code: "var timedOut=1; await new Promise(()=>{});",
              timeout_ms: 100,
            },
          ],
          ["js", { code: "nodeRepl.write(typeof timedOut);" }],
        ] as const) {
          const r = await request("tools/call", { name, arguments: args });
          assert.equal(r.error, undefined);
          if ("timeout_ms" in args)
            assert.equal(r.result.isError, true, JSON.stringify(r));
          else assert.notEqual(r.result.isError, true, JSON.stringify(r));
          values.push(r.result);
        }
        // Cancellation may intentionally suppress the cancelled call's response.
        // Wait for a file in this isolated TMPDIR to prove the cell started.
        const cancelId = ++id;
        send({
          id: cancelId,
          method: "tools/call",
          params: {
            name: "js",
            arguments: {
              code: 'var cancelled=1; await (await import("node:fs/promises")).writeFile(tmpDir+"/cancel-started", "ready"); await new Promise(()=>{});',
              timeout_ms: 5000,
            },
          },
        });
        const startDeadline = Date.now() + 3000;
        while (true) {
          try {
            await readFile(path.join(home, "cancel-started"));
            break;
          } catch (error) {
            if (Date.now() > startDeadline)
              throw Error("Cancelled cell never started");
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }
        send({
          method: "notifications/cancelled",
          params: { requestId: cancelId, reason: "fixture cancellation" },
        });
        const recovered = await request("tools/call", {
          name: "js",
          arguments: { code: "nodeRepl.write(typeof cancelled);" },
        });
        assert.notEqual(
          recovered.result?.isError,
          true,
          JSON.stringify(recovered),
        );
        values.push(recovered.result);
        const rpc = await request("tools/call", {
          name: "js",
          arguments: {
            code: 'nodeRepl.write(await nodeRepl.rpc("fixture",{value:17}));',
          },
        });
        assert.notEqual(rpc.result?.isError, true, JSON.stringify(rpc));
        values.push(rpc.result);
        outputs.push(values);
      } finally {
        clearTimeout(timer);
        child.stdin.end();
        const shutdown = setTimeout(() => child.kill(), 3000);
        await ended;
        clearTimeout(shutdown);
      }
      if (variant === "restored") {
        const kinds = (await readFile(path.join(home, "worker-kinds"), "utf8"))
          .trim()
          .split("\n");
        assert.equal(kinds.filter((kind) => kind === "kernel.js").length, 4);
        assert.equal(
          kinds.filter((kind) => kind === "trusted-worker.js").length,
          4,
        );
      }
    }
    assert.match(
      outputs[1][7].content.map((c: any) => c.text).join(""),
      /privileged: true, value: 17/,
    );
    // Native response timing/telemetry metadata may vary; compare public contents.
    const publicValues = outputs.map((values) => values.map((v) => v.content));
    assert.deepEqual(publicValues[1], publicValues[0]);
    assert.deepEqual(
      publicValues[1]
        .filter((_: any, i: number) => [0, 1, 3, 5, 6].includes(i))
        .map((content: any) => content.map((c: any) => c.text).join("")),
      ["40", "42", "undefined", "undefined", "undefined"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agent-neutral MCP client reaches both restored workers through the packaged demo adapter", async () => {
  const { McpToolClient } =
    await import("../packages/agent-loop/src/mcp-client");
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "cua-native-adapter-mcp-")),
  );
  const runtime = await stageRuntimePackages(restoredPackageSources(), root);
  try {
    const service = path.join(root, "fixture.mjs");
    await writeFile(
      service,
      'export function handleRpc(value){return {value,privileged:typeof nodeRepl.config.read === "function"};}',
    );
    const client = await McpToolClient.connect({
      command: "/usr/bin/sandbox-exec",
      args: [
        "-p",
        "(version 1)(allow default)(deny network*)",
        process.execPath,
        "--import",
        import.meta.resolve("tsx"),
        path.resolve("packages/agent-loop/src/native-supervisor.ts"),
      ],
      env: create_launch_environment({
        HOME: root,
        CODEX_HOME: root,
        TMPDIR: root,
        CUA_NATIVE_SUPERVISOR_PATH: binary,
        NODE_REPL_NODE_PATH: node,
        NODE_REPL_DISABLE_ANALYTICS: "1",
        NODE_REPL_NODE_MODULE_DIRS: runtime.root,
        CUA_REPL_ENABLED_SURFACES: "",
        NODE_REPL_TRUSTED_SERVICES: JSON.stringify({ fixture: service }),
        NODE_REPL_TRUSTED_CODE_PATHS: root,
        NODE_REPL_UNTRUSTED_ENV_ALLOWLIST:
          "DEEPSEEK_API_KEY,CUA_MODEL_ENDPOINT,CUA_REPL_ENABLED_SURFACES",
        DEEPSEEK_API_KEY: "fixture-not-a-real-key",
        CUA_MODEL_ENDPOINT: "fixture-not-a-real-endpoint",
      }),
      stderr: "pipe",
    });
    try {
      const tools = await client.listTools();
      const expectedTools = JSON.parse(
        create_launch_environment({ CUA_REPL_ENABLED_SURFACES: "" })
          .NODE_REPL_TOOL_OVERRIDES!,
      ).tools;
      assert.equal(
        tools.find((t) => t.name === "js")?.description,
        expectedTools.js.description,
      );
      assert.equal(
        tools.find((t) => t.name === "js_reset")?.description,
        expectedTools.js_reset.description,
      );
      const result = await client.callTool({
        id: "rpc",
        name: "js",
        arguments: {
          code: 'nodeRepl.write(await nodeRepl.rpc("fixture",17)); nodeRepl.write(Object.keys(nodeRepl.env).filter(key => /DEEPSEEK|CUA_MODEL/.test(key)));',
        },
      });
      assert.equal(result.isError, false, JSON.stringify(result));
      const initialText = result.content
        .map((c) => (c.type === "text" ? c.text : ""))
        .join("");
      assert.ok(initialText.includes("## Computer Use"));
      assert.ok(initialText.endsWith("{ privileged: true, value: 17 }[]"));
      const loaded = await client.callTool({
        id: "packages",
        name: "js",
        arguments: {
          code: "nodeRepl.write(typeof cua.getState); nodeRepl.write(typeof cua.getTab); nodeRepl.write(typeof cua.getApp);",
        },
      });
      assert.equal(loaded.isError, false, JSON.stringify(loaded));
      const loadedText = loaded.content
        .map((c) => (c.type === "text" ? c.text : ""))
        .join("");
      assert.ok(!loadedText.includes("## Computer Use"));
      assert.ok(loadedText.endsWith("functionundefinedundefined"));
      const reset = await client.callTool({
        id: "reset",
        name: "js_reset",
        arguments: {},
      });
      assert.equal(reset.isError, false);
      const afterReset = await client.callTool({
        id: "after-reset",
        name: "js",
        arguments: { code: "nodeRepl.write(typeof cua.getState);" },
      });
      assert.equal(afterReset.isError, false, JSON.stringify(afterReset));
      const resetText = afterReset.content
        .map((c) => (c.type === "text" ? c.text : ""))
        .join("");
      assert.ok(resetText.includes("## Computer Use"));
      assert.ok(resetText.endsWith("function"));
    } finally {
      await client.close();
    }
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("native MCP initializes the default restored browser service with isolated empty discovery", async () => {
  const { McpToolClient } =
    await import("../packages/agent-loop/src/mcp-client");
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "cua-native-browser-")),
  );
  const runtime = await stageRuntimePackages(restoredPackageSources(), root);
  try {
    const client = await McpToolClient.connect(
      {
        command: "/usr/bin/sandbox-exec",
        args: [
          "-p",
          "(version 1)(allow default)(deny network*)",
          process.execPath,
          "--import",
          import.meta.resolve("tsx"),
          path.resolve("packages/agent-loop/src/native-supervisor.ts"),
        ],
        env: create_launch_environment({
          HOME: root,
          CODEX_HOME: root,
          TMPDIR: root,
          CUA_NATIVE_SUPERVISOR_PATH: binary,
          NODE_REPL_NODE_PATH: node,
          NODE_REPL_DISABLE_ANALYTICS: "1",
          NODE_REPL_NODE_MODULE_DIRS: runtime.root,
          NODE_REPL_TRUSTED_CODE_PATHS: runtime.root,
          CUA_REPL_ENABLED_SURFACES: "browser",
          CUA_REPL_BROWSER_ENV: "codex-app",
          BROWSER_USE_BACKEND_PATHS: "",
          BROWSER_USE_AVAILABLE_BACKENDS: "chrome",
          BROWSER_USE_DISABLE_AMBIENT_NETWORK: "1",
        }),
        stderr: "pipe",
      },
      {
        requestMeta: () => ({
          "x-codex-turn-metadata": {
            session_id: "browser-fixture",
            turn_id: "turn-1",
          },
        }),
      },
    );
    try {
      const result = await client.callTool({
        id: "browser",
        name: "js",
        arguments: {
          code: "nodeRepl.write(typeof cua.getTab); nodeRepl.write(JSON.stringify(await cua.getState({emit:false})));",
        },
      });
      assert.equal(result.isError, false, JSON.stringify(result));
      const text = result.content
        .map((c) => (c.type === "text" ? c.text : ""))
        .join("");
      assert.ok(text.endsWith('function{"apps":[],"browsers":[]}'), text);
    } finally {
      await client.close();
    }
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

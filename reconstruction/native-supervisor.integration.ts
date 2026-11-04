/** Explicit local integration probe; not included in the default synthetic suite.
 * Runs the installed supervisor under macOS network denial with isolated homes.
 * The wrapper substitutes only the kernel entry; it is not a supervisor port.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, writeFile, readFile, rm, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
const binary =
  process.env.CUA_NODE_REPL_BINARY ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl";
const node = path.join(path.dirname(binary), "node");
test("installed native supervisor drives restored kernel over actual MCP and resets its state", async () => {
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
      await writeFile(
        wrapper,
        `const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const [workerDir,node,...args]=process.argv.slice(2);const index=args.findIndex(arg=>path.basename(arg)==='kernel.js');
if(index<0)throw Error('Unexpected worker launch');args[index]=${JSON.stringify(restored)};
fs.appendFileSync(${JSON.stringify(path.join(home, "launches"))},'kernel\\n');
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
        ] as const) {
          const r = await request("tools/call", { name, arguments: args });
          assert.equal(r.error, undefined);
          assert.notEqual(r.result.isError, true, JSON.stringify(r));
          values.push(r.result);
        }
        outputs.push(values);
      } finally {
        clearTimeout(timer);
        child.stdin.end();
        const shutdown = setTimeout(() => child.kill(), 3000);
        await ended;
        clearTimeout(shutdown);
      }
      if (variant === "restored")
        assert.equal(
          (await readFile(path.join(home, "launches"), "utf8"))
            .trim()
            .split("\n").length,
          2,
          "Reset must spawn a second restored kernel",
        );
    }
    // Native response timing/telemetry metadata may vary; compare public contents.
    const publicValues = outputs.map((values) => values.map((v) => v.content));
    assert.deepEqual(publicValues[1], publicValues[0]);
    assert.deepEqual(
      publicValues[1]
        .filter((_: any, i: number) => i !== 2)
        .map((content: any) => content.map((c: any) => c.text).join("")),
      ["40", "42", "undefined"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { extractNodeReplSources } from "../scripts/extract-node-repl-sources.mjs";
const exec = promisify(execFile);
const { files } = await extractNodeReplSources(
  process.env.CUA_NODE_REPL_BINARY,
);
async function variants(run: (entry: string, dir: string) => Promise<any>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cua-kernel-entry-"));
  try {
    await writeFile(path.join(dir, "package.json"), '{"type":"commonjs"}');
    for (const name of [
      "kernel.js",
      "worker-runtime.js",
      "realmChecks.js",
      "diagnostics.js",
      "meriyah.umd.min.js",
    ])
      await writeFile(path.join(dir, name), files[name]);
    await writeFile(path.join(dir, "fixture.mjs"), "export const value=17;");
    const results = [];
    for (const entry of [
      path.join(dir, "kernel.js"),
      path.resolve("packages/node-repl/dist/kernel.js"),
    ])
      results.push(await run(entry, dir));
    assert.deepEqual(results[1], results[0]);
    return results[1];
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
async function session(
  entry: string,
  dir: string,
  codes: string[],
  env: Record<string, string> = {},
) {
  const child = spawn(
    process.execPath,
    [
      "--experimental-vm-modules",
      entry,
      "--session-id",
      "test-session",
      "--working-dir",
      dir,
    ],
    { env, stdio: ["pipe", "pipe", "pipe"] },
  );
  let buffer = "",
    stderr = "";
  const messages: any[] = [];
  const results: any[] = [];
  let pending:
    | { resolve: (value: any) => void; reject: (error: Error) => void }
    | undefined;
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const ended = once(child, "exit");
  child.on("exit", (code) =>
    pending?.reject(Error("kernel exited " + code + " " + stderr)),
  );
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const message = JSON.parse(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
      if (message.type === "submitted_code_complete")
        message.execution_duration_ms = 0;
      messages.push(message);
      if (message.type === "trusted_service_request")
        child.stdin.write(
          JSON.stringify({
            id: message.id,
            ok: true,
            value: { echo: message.request },
            output: [{ kind: "line", text: "rpc-output" }],
            content_items: ["rpc-item"],
          }) + "\n",
        );
      if (message.type === "trusted_service_hooks")
        child.stdin.write(
          JSON.stringify({
            id: message.id,
            ok: true,
            output: [{ kind: "line", text: "hook-output" }],
          }) + "\n",
        );
      if (message.type === "emit_image")
        child.stdin.write(JSON.stringify({ id: message.id, ok: true }) + "\n");
      if (message.type === "exec_result") {
        const waiter = pending;
        pending = undefined;
        waiter?.resolve(message);
      }
    }
  });
  const timer = setTimeout(() => child.kill(), 15000);
  try {
    for (let i = 0; i < codes.length; i++)
      results.push(
        await new Promise((resolve, reject) => {
          pending = { resolve, reject };
          child.stdin.write(
            JSON.stringify({ type: "exec", id: "exec-" + i, code: codes[i] }) +
              "\n",
          );
        }),
      );
    child.stdin.end();
    await ended;
    return { results, messages };
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await ended;
    }
  }
}
test("complete kernel preserves cross-cell state, failed shadow recovery and import failures", async () => {
  const out = await variants((entry, dir) =>
    session(entry, dir, [
      "const x=4; let old=10; nodeRepl.write(x);",
      "x+=2; nodeRepl.write(x);",
      "let kept=7; let old=missing();",
      "nodeRepl.write({x,old,kept});",
      "const [a,b=missing()]=[1];",
      "nodeRepl.write(a); nodeRepl.write(typeof b);",
      'import nope from "node:path";',
      'nodeRepl.write(old); const imported=await import("./fixture.mjs"); nodeRepl.write(imported.value);',
      'future=3; throw Error("later"); var future; function ghost(){}',
      "nodeRepl.write({future,ghost:typeof ghost});",
    ]),
  );
  assert.equal(
    out.results[1].output,
    "Warning: x was declared with const; use let for reassignable variables.\n6",
  );
  assert.equal(out.results[2].ok, false);
  assert.match(out.results[3].output, /old: 10/);
  assert.equal(out.results[5].output, "1undefined");
  assert.equal(out.results[6].error_kind, "import_error");
  assert.equal(out.results[7].output, "1017");
  assert.match(out.results[9].output, /ghost: 'undefined'/);
});
test("complete kernel wires banner, environment filtering, RPC/hook responses and output grouping", async () => {
  const out = await variants((entry, dir) =>
    session(
      entry,
      dir,
      [
        'nodeRepl.write(nodeRepl.env); nodeRepl.write(await nodeRepl.rpc("fixture",{value:3}));',
        'nodeRepl.write("a","named"); nodeRepl.write("b","named"); console.log("line"); await nodeRepl.emitImage("data:image/png;base64,AA==");',
        'try { await nodeRepl.rpc("",{}); } catch(e) { nodeRepl.write(e.message); } nodeRepl.write(globalThis.bannerCount);',
      ],
      {
        NODE_REPL_TRUSTED_RPC_ENABLED: "1",
        NODE_REPL_JS_BANNER:
          "globalThis.bannerCount=(globalThis.bannerCount??0)+1;",
        NODE_REPL_UNTRUSTED_ENV_ALLOWLIST: "VISIBLE",
        VISIBLE: "fixture",
        HIDDEN: "not-exposed",
      },
    ),
  );
  assert.match(out.results[0].output, /VISIBLE/);
  assert.ok(!out.results[0].output.includes("HIDDEN"));
  assert.deepEqual(out.results[0].content_items, ["rpc-item"]);
  assert.deepEqual(out.results[1].named_outputs, ["ab"]);
  assert.match(out.results[2].output, /identifier1/);
  assert.equal(
    out.messages.filter((m: any) => m.type === "trusted_service_hooks").length,
    3,
  );
});
test("kernel rejects malformed bootstrap and reports fatal asynchronous errors before exit", async () => {
  const out = await variants(async (entry, dir) => {
    let invalid: any;
    try {
      await exec(process.execPath, ["--experimental-vm-modules", entry], {
        env: {},
        timeout: 10000,
      });
    } catch (e) {
      invalid = {
        code: (e as any).code,
        diagnostic: (e as any).stderr.includes("missing --session-id"),
      };
    }
    const child = spawn(
      process.execPath,
      [
        "--experimental-vm-modules",
        entry,
        "--session-id",
        "fatal",
        "--working-dir",
        dir,
      ],
      { env: {}, stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.resume();
    const timer = setTimeout(() => child.kill(), 10000);
    const ended = once(child, "exit");
    child.stdin.write(
      JSON.stringify({
        type: "exec",
        id: "fatal",
        code: 'setTimeout(()=>{throw new Error("fatal fixture")},0); await new Promise(()=>{});',
      }) + "\n",
    );
    const [code] = await ended;
    clearTimeout(timer);
    const messages = stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    return {
      invalid,
      code,
      result: messages.find((m) => m.type === "exec_result"),
    };
  });
  assert.deepEqual(out.invalid, { code: 1, diagnostic: true });
  assert.equal(out.code, 1);
  assert.equal(out.result.error_kind, "uncaught_exception");
  assert.match(out.result.error, /fatal fixture/);
});

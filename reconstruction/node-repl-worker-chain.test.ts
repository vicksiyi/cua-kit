import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import {
  mkdtemp,
  writeFile,
  mkdir,
  cp,
  readFile,
  rm,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { extractNodeReplSources } from "../scripts/extract-node-repl-sources.mjs";
const { files } = await extractNodeReplSources(
  process.env.CUA_NODE_REPL_BINARY,
);
async function stagePackage(source: string, dest: string) {
  await mkdir(dest, { recursive: true });
  const pkg = JSON.parse(
    await readFile(path.join(source, "package.json"), "utf8"),
  );
  await cp(source, dest, {
    recursive: true,
    filter: (p) =>
      !path.relative(source, p).split(path.sep).includes("node_modules"),
  });
  const req = createRequire(path.join(source, "package.json"));
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    let dependency = name.startsWith("@core/")
      ? path.resolve("packages", name.slice(6))
      : path.dirname(req.resolve(name));
    while (true) {
      try {
        const p = JSON.parse(
          await readFile(path.join(dependency, "package.json"), "utf8"),
        );
        if (p.name === name) break;
      } catch {}
      const parent = path.dirname(dependency);
      if (parent === dependency) throw Error("package root not found: " + name);
      dependency = parent;
    }
    await stagePackage(dependency, path.join(dest, "node_modules", name));
  }
}
test("actual kernel and trusted worker reach restored Sky service and native pipe boundary", async () => {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "cua-worker-chain-")),
  );
  try {
    const original = path.join(root, "original");
    await mkdir(original);
    await writeFile(path.join(original, "package.json"), '{"type":"commonjs"}');
    for (const name of [
      "kernel.js",
      "trusted-worker.js",
      "worker-runtime.js",
      "realmChecks.js",
      "diagnostics.js",
      "meriyah.umd.min.js",
      "privileged-node-repl.js",
      "privileged-node-repl-config.js",
      "tracing.js",
    ])
      await writeFile(path.join(original, name), files[name]);
    await stagePackage(
      path.resolve("packages/sky"),
      path.join(root, "node_modules/@core/sky"),
    );
    const config = path.join(root, "sky-config.json");
    await writeFile(config, '{"target":"windows"}');
    const outputs = [];
    for (const variant of ["original", "restored"]) {
      const kernelPath =
        variant === "original"
          ? path.join(original, "kernel.js")
          : path.resolve("packages/node-repl/dist/kernel.js");
      const trustedPath =
        variant === "original"
          ? path.join(original, "trusted-worker.js")
          : path.resolve("packages/node-repl/dist/trusted_worker.js");
      const env = {
        NODE_REPL_NODE_MODULE_DIRS: root,
        CODEX_DISABLE_ANALYTICS: "1",
        SKY_ENABLE_AUDIO: "0",
      };
      const trusted = spawn(process.execPath, [trustedPath, root], {
        env: {
          ...env,
          NODE_REPL_TRUSTED_SERVICES: JSON.stringify({
            sky: "@core/sky/service",
          }),
          NODE_REPL_TRUSTED_CODE_PATHS: root,
          OAI_SKY_CONFIG_PATH: config,
          SKY_CUA_NATIVE_PIPE: "1",
          SKY_CUA_NATIVE_PIPE_DIRECTORY: "fixture-pipe",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const kernel = spawn(
        process.execPath,
        [
          "--experimental-vm-modules",
          kernelPath,
          "--session-id",
          "chain",
          "--working-dir",
          root,
        ],
        {
          env: { ...env, NODE_REPL_TRUSTED_RPC_ENABLED: "1" },
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      const exits = [once(kernel, "exit"), once(trusted, "exit")];
      let errors = "";
      for (const child of [kernel, trusted])
        child.stderr.on("data", (b) => (errors += b));
      const events: any[] = [];
      const trace: any[] = [],
        results: any[] = [];
      let pending:
        { resolve: (v: any) => void; reject: (e: Error) => void } | undefined;
      const send = (child: typeof kernel, message: any) =>
        child.stdin.write(JSON.stringify(message) + "\n");
      const listen = (child: typeof kernel, handle: (m: any) => void) => {
        let buffer = "";
        child.stdout.on("data", (chunk) => {
          buffer += chunk;
          let nl;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const m = JSON.parse(buffer.slice(0, nl));
            buffer = buffer.slice(nl + 1);
            handle(m);
          }
        });
      };
      listen(kernel, (m) => {
        events.push(["kernel", m]);
        if (m.type === "trusted_service_request")
          send(trusted, {
            ...m,
            type: "service",
            request_meta: { session_id: "chain", turn_id: "turn" },
          });
        else if (m.type === "trusted_service_hooks")
          send(trusted, { ...m, type: "run_hooks" });
        else if (m.type === "exec_result") {
          pending?.resolve(m);
          pending = undefined;
        }
      });
      listen(trusted, (m) => {
        events.push(["trusted", m]);
        if (m.type === "emit_image") {
          send(trusted, { id: m.id, ok: true });
          return;
        }
        if (m.type === "trusted_service_response") {
          send(kernel, m);
          return;
        }
        if (m.type === "native_pipe_request") {
          if (m.op === "connect") {
            send(trusted, {
              type: "native_pipe_response",
              id: m.id,
              ok: true,
              result: { connection_id: "pipe" },
            });
            return;
          }
          send(trusted, {
            type: "native_pipe_response",
            id: m.id,
            ok: true,
            result: {},
          });
          if (m.op === "write") {
            const bytes = Buffer.from(m.data_base64, "base64");
            const request = JSON.parse(bytes.subarray(4).toString());
            trace.push(request.params);
            const method = request.params.method;
            const window = { app: "fixture", id: 1 };
            const result =
              method === "list_windows"
                ? [window]
                : method === "get_window_state"
                  ? {
                      window,
                      screenshots: [
                        {
                          url: "data:image/png;base64,AQID",
                          id: "s",
                          zIndex: 0,
                        },
                      ],
                      accessibility: { tree: "fixture tree" },
                    }
                  : null;
            const payload = Buffer.from(
              JSON.stringify({ id: request.id, result }),
            );
            const header = Buffer.alloc(4);
            header.writeUInt32LE(payload.length);
            const frame = Buffer.concat([header, payload]);
            for (const part of [frame.subarray(0, 2), frame.subarray(2)])
              send(trusted, {
                type: "native_pipe_data",
                connection_id: "pipe",
                data_base64: part.toString("base64"),
              });
          }
        }
      });
      for (const child of [kernel, trusted])
        child.on("exit", (code) =>
          pending?.reject(
            Error(
              "worker exit " + code + " " + errors + JSON.stringify(events),
            ),
          ),
        );
      const timer = setTimeout(() => {
        kernel.kill();
        trusted.kill();
      }, 15000);
      try {
        const codes = [
          'var sky= (await import("@core/sky")).sky; var windows=await sky.list_windows(); nodeRepl.write(windows);',
          "await sky.click({window:windows[0],x:1.5,y:2.5}); nodeRepl.write((await sky.get_window_state({window:windows[0],include_screenshot:true})).screenshots[0].url);",
          'try{await nodeRepl.rpc("sky",{type:"execute",method:"close",args:[]})}catch(e){nodeRepl.write(e.message)}',
        ];
        for (let i = 0; i < codes.length; i++)
          results.push(
            await new Promise((resolve, reject) => {
              pending = { resolve, reject };
              send(kernel, { type: "exec", id: "exec-" + i, code: codes[i] });
            }),
          );
        outputs.push({
          results,
          trace,
          imageCount: events.filter(
            ([side, m]) => side === "trusted" && m.type === "emit_image",
          ).length,
          hookCount: events.filter(
            ([side, m]) =>
              side === "kernel" && m.type === "trusted_service_hooks",
          ).length,
        });
      } finally {
        clearTimeout(timer);
        kernel.stdin.end();
        trusted.stdin.end();
        await Promise.all(exits);
      }
    }
    assert.deepEqual(outputs[1], outputs[0]);
    assert.equal(outputs[1].imageCount, 1);
    assert.equal(outputs[1].hookCount, 3);
    assert.ok(
      outputs[1].results.every((r) => r.ok),
      JSON.stringify(outputs[1]),
    );
    assert.deepEqual(
      outputs[1].trace.map((q) => q.method),
      ["list_windows", "click", "get_window_state"],
    );
    assert.equal(outputs[1].trace[1].params.x, 2);
    assert.equal(outputs[1].trace[1].params.y, 3);
    assert.equal(outputs[1].results[1].output, "data:image/png;base64,AQID");
    assert.match(outputs[1].results[2].output, /not available: close/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("restored trusted service exports remain resolvable by the original createRequire path", () => {
  const require = createRequire(path.resolve("package.json"));
  for (const name of ["sky", "browser-desktop"]) {
    assert.equal(
      require.resolve(`@core/${name}/service`),
      path.resolve(`packages/${name}/dist/service.js`),
    );
  }
});

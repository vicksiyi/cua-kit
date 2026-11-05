import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

for (const closure of ["eof", "sigterm"] as const)
  test(
    `external MCP stdio ${closure} awaits worker cleanup`,
    { skip: process.platform !== "darwin", timeout: 15000 },
    async () => {
      const root = await mkdtemp(join(tmpdir(), "core-stdio-"));
      const marker = join(root, "closed.json");
      const entry = join(root, "server.mjs");
      await writeFile(
        entry,
        `
 import {serveSupervisorStdio} from ${JSON.stringify(pathToFileURL(resolve("packages/runtime-supervisor/dist/stdio.js")).href)};
 import {ProcessWorkerPort} from ${JSON.stringify(pathToFileURL(resolve("packages/runtime-supervisor/dist/process-port.js")).href)};
 import {writeFile} from "node:fs/promises";
 const root=${JSON.stringify(root)};const pids=[];
 const host=await serveSupervisorStdio({services:[],launch:async()=>{
 const start=(entry,args)=>ProcessWorkerPort.start({command:"/usr/bin/sandbox-exec",args:["-p","(version 1)(allow default)(deny network*)",process.execPath,"--experimental-vm-modules",entry,...args],cwd:root,env:{HOME:root,TMPDIR:root,NODE_REPL_TRUSTED_RPC_ENABLED:"1",NODE_REPL_TRUSTED_SERVICES:"{}",NODE_REPL_TRUSTED_CODE_PATHS:root},terminateGraceMs:20});
 const kernel=await start(${JSON.stringify(resolve("packages/node-repl/dist/kernel.js"))},["--session-id","fixture","--working-dir",root]);pids.push(kernel.pid);
 try {const trusted=await start(${JSON.stringify(resolve("packages/node-repl/dist/trusted_worker.js"))},[root]);pids.push(trusted.pid);return {kernel,trusted};}catch(error){await kernel.close();throw error;}
 }});
 await host.closed;
 await writeFile(${JSON.stringify(marker)},JSON.stringify(pids));
 `,
      );
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [entry],
        cwd: root,
        env: { HOME: root, TMPDIR: root },
        stderr: "pipe",
      });
      let stderr = "";
      transport.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      const client = new Client({ name: "external-fixture", version: "1" });
      try {
        await client.connect(transport);
        assert.equal((await client.listTools()).tools.length, 4);
        const result = await client.callTool({
          name: "js",
          arguments: { code: "let x=40;nodeRepl.write(x)" },
        });
        assert.equal(result.isError, false, JSON.stringify(result));
        assert.match(
          JSON.stringify(
            (
              await client.callTool({
                name: "js",
                arguments: { code: "x+=2;nodeRepl.write(x)" },
              })
            ).content,
          ),
          /42/,
        );
        if (closure === "eof") await client.close();
        else {
          const ended = new Promise<void>((resolve) => {
            client.onclose = resolve;
          });
          assert.ok(transport.pid);
          process.kill(transport.pid, "SIGTERM");
          await ended;
        }
        const pids = JSON.parse(await readFile(marker, "utf8")) as number[];
        assert.equal(pids.length, 2);
        for (const pid of pids)
          assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
        assert.equal(stderr, "");
      } finally {
        await client.close();
        await rm(root, { recursive: true, force: true });
      }
    },
  );

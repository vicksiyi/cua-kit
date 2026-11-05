import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  createSupervisorMcpServer,
  workerResultToMcp,
} from "../packages/runtime-supervisor/src/mcp";
import { ProcessWorkerPort } from "../packages/runtime-supervisor/src/process-port";

test(
  "MCP client drives restored workers, metadata, elicitation, cancellation and reset",
  { skip: process.platform !== "darwin", timeout: 20000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "core-mcp-"));
    await writeFile(join(root, "package.json"), '{"type":"module"}');
    await writeFile(
      join(root, "service.mjs"),
      'export async function handleRpc(){return await nodeRepl.createElicitation({message:"Approve fixture?",meta:{fixture:true}})}',
    );
    let launches = 0,
      decision: "accept" | "decline" = "decline";
    let started: (() => void) | undefined;
    const runtime = createSupervisorMcpServer({
      services: ["fixture"],
      launch: async () => {
        launches++;
        const env = {
          HOME: root,
          TMPDIR: root,
          NODE_REPL_TRUSTED_RPC_ENABLED: "1",
          NODE_REPL_TRUSTED_CODE_PATHS: root,
          NODE_REPL_TRUSTED_SERVICES: JSON.stringify({
            fixture: join(root, "service.mjs"),
          }),
        };
        const start = (entry: string, args: string[]) =>
          ProcessWorkerPort.start({
            command: "/usr/bin/sandbox-exec",
            args: [
              "-p",
              "(version 1)(allow default)(deny network*)",
              process.execPath,
              "--experimental-vm-modules",
              resolve(entry),
              ...args,
            ],
            cwd: root,
            env,
            terminateGraceMs: 20,
          });
        const kernel = await start("packages/node-repl/dist/kernel.js", [
          "--session-id",
          "fixture",
          "--working-dir",
          root,
        ]);
        try {
          return {
            kernel,
            trusted: await start("packages/node-repl/dist/trusted_worker.js", [
              root,
            ]),
          };
        } catch (error) {
          await kernel.close();
          throw error;
        }
      },
    });
    const client = new Client(
      { name: "fixture", version: "1" },
      { capabilities: { elicitation: { form: {} } } },
    );
    client.setRequestHandler(ElicitRequestSchema, async (request) => {
      assert.equal(request.params.message, "Approve fixture?");
      assert.deepEqual(request.params._meta, { fixture: true });
      started?.();
      return { action: decision, content: {} };
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    try {
      await runtime.server.connect(serverTransport);
      await client.connect(clientTransport);
      assert.deepEqual(
        (await client.listTools()).tools.map((t) => t.name),
        ["js", "js_reset", "turn_ended"],
      );
      assert.equal(launches, 0);
      const invalid = await client.callTool({
        name: "js",
        arguments: { code: "1", requestMeta: { forged: true } },
      });
      assert.equal(invalid.isError, true);
      assert.equal(launches, 0);
      const first = await client.callTool({
        name: "js",
        arguments: {
          code: "let value=40;nodeRepl.write(nodeRepl.requestMeta)",
        },
        _meta: { fixture: "host" },
      });
      assert.match(JSON.stringify(first.content), /host/);
      assert.match(
        JSON.stringify(
          (
            await client.callTool({
              name: "js",
              arguments: { code: "value+=2;nodeRepl.write(value)" },
            })
          ).content,
        ),
        /42/,
      );
      for (decision of ["accept", "decline"]) {
        const result = await client.callTool({
          name: "js",
          arguments: {
            code: 'nodeRepl.write(await nodeRepl.rpc("fixture",{}))',
          },
        });
        assert.equal(result.isError, false);
        assert.match(JSON.stringify(result.content), new RegExp(decision));
      }
      assert.equal(
        (
          await client.callTool({
            name: "js",
            arguments: { code: 'throw Error("fixture-failure")' },
          })
        ).isError,
        true,
      );
      const controller = new AbortController();
      const observed = new Promise<void>((resolve) => {
        started = resolve;
      });
      const running = client.callTool(
        {
          name: "js",
          arguments: {
            code: 'await nodeRepl.rpc("fixture",{});await new Promise(()=>{})',
          },
        },
        undefined,
        { signal: controller.signal },
      );
      const rejected = assert.rejects(running);
      await observed;
      controller.abort();
      await rejected;
      started = undefined;
      const fresh = await client.callTool({
        name: "js",
        arguments: { code: "nodeRepl.write(typeof value)" },
      });
      assert.match(JSON.stringify(fresh.content), /undefined/);
      assert.equal(launches, 2);
      await client.callTool({
        name: "turn_ended",
        arguments: {
          hook_event_name: "turn_ended",
          session_id: "fixture",
          turn_id: "one",
        },
      });
      assert.equal(
        (
          await client.callTool({
            name: "js_add_node_module_dir",
            arguments: { path: root },
          })
        ).isError,
        true,
      );
      await client.callTool({ name: "js_reset", arguments: {} });
      assert.equal(
        (
          await client.callTool({
            name: "js",
            arguments: { code: "nodeRepl.write(7)" },
          })
        ).isError,
        false,
      );
      assert.equal(launches, 3);
    } finally {
      await client.close();
      await runtime.close();
      await rm(root, { recursive: true, force: true });
    }
    await assert.rejects(runtime.session.execute("1"), /closed/);
  },
);

test("MCP result mapping preserves standard content and rejects opaque items", () => {
  assert.deepEqual(
    workerResultToMcp({
      ok: true,
      output: "hello",
      content_items: [{ type: "image", data: "AA==", mimeType: "image/png" }],
    }),
    {
      isError: false,
      content: [
        { type: "text", text: "hello" },
        { type: "image", data: "AA==", mimeType: "image/png" },
      ],
    },
  );
  assert.throws(() =>
    workerResultToMcp({ ok: true, content_items: ["opaque"] }),
  );
  assert.equal(
    workerResultToMcp({ ok: false, error: "failure" }).isError,
    true,
  );
});

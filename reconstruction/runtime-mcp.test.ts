import test from "node:test";
import { createServer, type Socket, type AddressInfo } from "node:net";
import {
  createServer as createHttpServer,
  type ServerResponse,
} from "node:http";
import { UnixNativePipeHost } from "../packages/runtime-supervisor/src/native-pipe-host";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, mkdir, realpath } from "node:fs/promises";
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
    const socketPath = join(root, "fixture.sock");
    let peer: Socket | undefined;
    const socketServer = createServer((socket) => {
      peer = socket;
      socket.on("data", (data) => socket.write(data));
    });
    await new Promise<void>((resolve, reject) => {
      socketServer.once("error", reject);
      socketServer.listen(socketPath, resolve);
    });
    let httpResponse: ServerResponse | undefined,
      httpStarted: (() => void) | undefined;
    const httpServer = createHttpServer((_request, response) => {
      httpResponse = response;
      httpStarted?.();
    });
    await new Promise<void>((resolve) =>
      httpServer.listen(0, "127.0.0.1", resolve),
    );
    const httpUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/fixture`;
    let fetchSignal: AbortSignal | undefined;
    let idleReceived!: () => void;
    const idleObserved = new Promise<void>((resolve) => {
      idleReceived = resolve;
    });
    await writeFile(
      join(root, "service.mjs"),
      'let pipe;let received=[];let waiting;let fetched;export async function handleRpc(x){if(x?.fetchStart){fetched=nodeRepl.fetch(x.fetchStart).then(r=>r.text());void fetched.catch(()=>{});return "started";}if(x?.fetchWait)return await fetched;if(x?.meta){nodeRepl.setResponseMeta(x.meta);return "meta set";}if(x?.image){await nodeRepl.emitImage(x.image);return "image emitted";}if(x?.open){pipe=await nodeRepl.nativePipe.createConnection(x.open);pipe.on("data",data=>{received.push(data.toString());waiting?.(data.toString());waiting=null});return "connected";}if(x?.write){const reply=new Promise(r=>waiting=r);pipe.write(new TextEncoder().encode(x.write));return await reply;}if(x?.read)return received;return await nodeRepl.createElicitation({message:"Approve fixture?",meta:{fixture:true}})}',
    );
    const moduleDir = join(root, "external", "node_modules");
    await mkdir(join(moduleDir, "fixture-module"), { recursive: true });
    await writeFile(
      join(moduleDir, "fixture-module", "package.json"),
      JSON.stringify({
        name: "fixture-module",
        type: "module",
        main: "index.js",
      }),
    );
    await writeFile(
      join(moduleDir, "fixture-module", "index.js"),
      "export const value = 137;",
    );
    const canonicalModuleDir = await realpath(moduleDir);
    let launches = 0,
      decision: "accept" | "decline" = "decline";
    let started: (() => void) | undefined;
    const runtime = createSupervisorMcpServer({
      services: ["fixture"],
      hostRequest: async (message, context) => {
        assert.equal(message.type, "authenticated_fetch");
        assert.equal(message.request.url, httpUrl);
        fetchSignal = context.signal;
        const response = await fetch(httpUrl, { signal: context.signal });
        return {
          ok: true,
          response: {
            status: response.status,
            status_text: response.statusText,
            headers: [],
            body_base64: Buffer.from(await response.arrayBuffer()).toString(
              "base64",
            ),
          },
        };
      },
      nativePipeHost: (emit) =>
        new UnixNativePipeHost([socketPath], (message) => {
          emit(message);
          if (
            message.type === "native_pipe_data" &&
            Buffer.from(message.data_base64, "base64").toString() === "idle"
          )
            idleReceived();
        }),
      authorizeModuleDirectory: async (path) => {
        if (path !== canonicalModuleDir)
          throw Error("Module directory denied by fixture policy");
      },
      launch: async () => {
        launches++;
        const env = {
          HOME: root,
          TMPDIR: root,
          NODE_REPL_TRUSTED_RPC_ENABLED: "1",
          NODE_REPL_ENABLE_AUDIO: "1",
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
        ["js", "js_add_node_module_dir", "js_reset", "turn_ended"],
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
      const metadataResult = await client.callTool({
        name: "js",
        arguments: {
          code: 'await nodeRepl.rpc("fixture",{meta:{first:true,surface:{kind:"old"}}});await nodeRepl.rpc("fixture",{meta:{second:2,surface:{kind:"new"}}});nodeRepl.write("metadata")',
        },
      });
      assert.equal(metadataResult.isError, false);
      assert.deepEqual(metadataResult._meta, {
        first: true,
        second: 2,
        surface: { kind: "new" },
      });
      const noMetadata = await client.callTool({
        name: "js",
        arguments: { code: 'nodeRepl.write("next")' },
      });
      assert.equal(noMetadata._meta, undefined);
      const png =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=";
      const media = await client.callTool({
        name: "js",
        arguments: {
          code: `nodeRepl.emitImage("data:image/png;base64,${png}");await nodeRepl.emitAudio("data:audio/wav;base64,UklGRg==");nodeRepl.write("media done")`,
        },
      });
      assert.equal(media.isError, false);
      assert.deepEqual(media.content, [
        { type: "text", text: "media done" },
        { type: "image", data: png, mimeType: "image/png" },
        { type: "audio", data: "UklGRg==", mimeType: "audio/wav" },
      ]);
      const trustedMedia = await client.callTool({
        name: "js",
        arguments: {
          code: `await nodeRepl.rpc("fixture",{image:"data:image/png;base64,${png}"});throw Error("after-media")`,
        },
      });
      assert.equal(trustedMedia.isError, true);
      assert.ok(Array.isArray(trustedMedia.content));
      assert.deepEqual(
        trustedMedia.content.find((item) => item.type === "image"),
        { type: "image", data: png, mimeType: "image/png" },
      );
      const badMedia = await client.callTool({
        name: "js",
        arguments: {
          code: 'await nodeRepl.emitImage("data:text/plain,not-an-image")',
        },
      });
      assert.equal(badMedia.isError, true);
      const nextMedia = await client.callTool({
        name: "js",
        arguments: { code: 'nodeRepl.write("clean")' },
      });
      assert.deepEqual(nextMedia.content, [{ type: "text", text: "clean" }]);
      const importCode =
        'nodeRepl.write((await import("fixture-module")).value)';
      assert.equal(
        (await client.callTool({ name: "js", arguments: { code: importCode } }))
          .isError,
        true,
      );
      assert.equal(
        (
          await client.callTool({
            name: "js_add_node_module_dir",
            arguments: { path: moduleDir },
          })
        ).isError,
        undefined,
      );
      const imported = await client.callTool({
        name: "js",
        arguments: { code: importCode },
      });
      assert.equal(imported.isError, false);
      assert.match(JSON.stringify(imported.content), /137/);
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
      let arrived = new Promise<void>((resolve) => {
        httpStarted = resolve;
      });
      const backgroundStart = await client.callTool({
        name: "js",
        arguments: {
          code: `nodeRepl.write(await nodeRepl.rpc("fixture",{fetchStart:${JSON.stringify(httpUrl)}}))`,
        },
      });
      assert.equal(backgroundStart.isError, false);
      await arrived;
      assert.equal(fetchSignal?.aborted, false);
      const whilePending = await client.callTool({
        name: "js",
        arguments: { code: 'nodeRepl.write("independent next cell")' },
      });
      assert.equal(whilePending.isError, false);
      httpResponse!.end("fixture HTTP response");
      const fetched = await client.callTool({
        name: "js",
        arguments: {
          code: 'nodeRepl.write(await nodeRepl.rpc("fixture",{fetchWait:true}))',
        },
      });
      assert.equal(fetched.isError, false);
      assert.match(JSON.stringify(fetched.content), /fixture HTTP response/);
      arrived = new Promise<void>((resolve) => {
        httpStarted = resolve;
      });
      await client.callTool({
        name: "js",
        arguments: {
          code: `await nodeRepl.rpc("fixture",{fetchStart:${JSON.stringify(httpUrl)}})`,
        },
      });
      await arrived;
      const httpClosed = new Promise<void>((resolve) =>
        httpResponse!.once("close", resolve),
      );
      await client.callTool({ name: "js_reset", arguments: {} });
      assert.equal(fetchSignal?.aborted, true);
      await httpClosed;
      const openPipe = await client.callTool({
        name: "js",
        arguments: {
          code: `nodeRepl.write(await nodeRepl.rpc("fixture",{open:${JSON.stringify(socketPath)}}))`,
        },
      });
      assert.equal(openPipe.isError, false);
      const echoed = await client.callTool({
        name: "js",
        arguments: {
          code: 'nodeRepl.write(await nodeRepl.rpc("fixture",{write:"echo"}))',
        },
      });
      assert.equal(echoed.isError, false);
      assert.match(JSON.stringify(echoed.content), /echo/);
      peer!.write("idle");
      await idleObserved;
      const idleResult = await client.callTool({
        name: "js",
        arguments: {
          code: 'nodeRepl.write(await nodeRepl.rpc("fixture",{read:true}))',
        },
      });
      assert.equal(idleResult.isError, false);
      assert.match(JSON.stringify(idleResult.content), /idle/);
      const peerClosed = new Promise<void>((resolve) =>
        peer!.once("close", resolve),
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
      assert.equal(launches, 3);
      await peerClosed;
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
      assert.equal(launches, 4);
      const afterReset = await client.callTool({
        name: "js",
        arguments: { code: importCode },
      });
      assert.equal(afterReset.isError, false);
      assert.match(JSON.stringify(afterReset.content), /137/);
    } finally {
      await client.close();
      await runtime.close();
      httpServer.closeAllConnections();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      peer?.destroy();
      await new Promise<void>((resolve) => socketServer.close(() => resolve()));
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

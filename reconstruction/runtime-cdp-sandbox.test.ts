import { prepareIndependentBrowserRuntime } from "../packages/agent-loop/src/independent-runtime";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { AgentLoop } from "../packages/agent-loop/src/loop";
import { createDemoModel } from "../packages/agent-loop/src/provider";
import { browserPreflight } from "../packages/agent-loop/src/browser-preflight";
import { createTerminalTrace } from "../packages/agent-loop/src/terminal-trace";
import { BROWSER_INPUT_CONTEXT } from "../packages/agent-loop/src/browser-guidance";
import { CDP_OPERATION_CONTEXT } from "../packages/agent-loop/src/cdp-guidance";
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { startCdpHost } from "../packages/cdp-host/src/host";
import { stageRuntimePackages } from "../packages/agent-loop/src/runtime-packages";
import { McpToolClient } from "../packages/agent-loop/src/mcp-client";
import { NodeReplTurnClient } from "../packages/agent-loop/src/node-repl-turn";

/** Real browser and OS-sandboxed restored workers, without the installed supervisor. */
test("independent sandboxed supervisor executes real browser input, click, read and screenshot over MCP", {
  skip: process.platform !== "darwin" || process.env.CUA_TEST_MACOS_SANDBOX !== "1",
  timeout: 120000,
}, async () => {
  const rustRuntime = process.env.CUA_TEST_RUST_RUNTIME === "1";
  const liveModel = process.env.CUA_LIVE_DEEPSEEK_TEST === "1";
  const query = `independent-query-${randomUUID()}`;
  const marker = `observed-${randomUUID()}`;
  const submissions: string[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url!, "http://fixture.invalid");
    res.setHeader("content-type", "text/html");
    if (url.pathname === "/submit") {
      submissions.push(url.searchParams.get("query") ?? "");
      res.end(`<h1>Saved fixture result</h1><p>${marker}</p>`);
    } else res.end('<h1>Independent runtime fixture</h1><form action="/submit"><label>Query<input name="query"></label><button>Submit</button></form>');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const root = await realpath(await mkdtemp("/tmp/core-real-browser-"));
  let host: Awaited<ReturnType<typeof startCdpHost>> | undefined;
  let staged: Awaited<ReturnType<typeof stageRuntimePackages>> | undefined;
  let turn: NodeReplTurnClient | undefined;
  let rust: Awaited<ReturnType<typeof prepareIndependentBrowserRuntime>> | undefined;
  try {
    const kernelDir = join(root, "kernel"), trustedDir = join(root, "trusted"), codeDir = join(root, "code");
    await Promise.all([mkdir(kernelDir), mkdir(trustedDir), mkdir(codeDir)]);
    host = await startCdpHost({ headless: true });
    const endpointFile = await realpath(host.endpointFile);
    assert.equal(host.endpointFile, endpointFile);
    staged = await stageRuntimePackages([resolve("packages/native-host"), resolve("packages/cua")]);
    const workers = await realpath(resolve("packages/node-repl"));
    const dependencies = await realpath(resolve("node_modules"));
    const configFile = join(root, "config.toml"), requirementsFile = join(root, "requirements.toml"), browserConfigFile = join(root, "browser.toml");
    await writeFile(configFile, "[browser_use]\nallow_history_access = false\n");
    await writeFile(requirementsFile, "[featureRequirements]\nbrowser_use_full_cdp_access = false\n");
    await writeFile(browserConfigFile, "full_cdp_access_enabled = false\n");
    const sessionFile = join(root, "session.toml");
    await writeFile(sessionFile, "");
    const worker = (trusted: boolean) => ({
      node: process.execPath,
      bootstrap: resolve("packages/runtime-supervisor/dist/sandbox-bootstrap.js"),
      addon: resolve("native/macos-sandbox/dist/sandbox.node"),
      entry: join(workers, trusted ? "dist/trusted_worker.js" : "dist/kernel.js"),
      args: trusted ? [trustedDir] : ["--session-id", "independent-browser", "--working-dir", kernelDir],
      directory: trusted ? trustedDir : kernelDir,
      readDirectories: [workers, dependencies, codeDir, staged!.root, ...(trusted ? [dirname(endpointFile)] : [])],
      workerEnvironment: {
        NODE_REPL_TRUSTED_RPC_ENABLED: "1",
        NODE_REPL_TRUSTED_SERVICES: JSON.stringify({ browser: "@core/native-host/browserService" }),
        NODE_REPL_TRUSTED_CODE_PATHS: staged!.root,
        NODE_REPL_NODE_MODULE_DIRS: staged!.root,
        NODE_REPL_UNTRUSTED_ENV_ALLOWLIST: "CUA_REPL_ENABLED_SURFACES,CUA_REPL_BROWSER_ENV",
        CUA_REPL_ENABLED_SURFACES: "browser",
        CUA_REPL_BROWSER_ENV: "codex-app",
        ...(trusted ? {
          CORE_CUA_ENDPOINT_FILES: JSON.stringify([endpointFile]),
          BROWSER_USE_BACKEND_PATHS: host!.endpoint.socketPath,
          BROWSER_USE_AVAILABLE_BACKENDS: "cdp",
          BROWSER_USE_DISABLE_AMBIENT_NETWORK: "1",
        } : {}),
      },
      terminateGraceMs: 20,
    });
    const options = {
      kernel: worker(false), trusted: worker(true), services: ["browser"],
      pipePaths: [host.endpoint.socketPath],
      writablePreferencePaths: ["browser/config.toml", "browser/sessions/independent-browser.toml"],
      config: { configFile, requirementsFile, workingDirectories: [trustedDir], tomlFiles: { "browser/config.toml": browserConfigFile, "browser/sessions/independent-browser.toml": sessionFile } },
    };
    const entry = join(codeDir, "stdio.mjs");
    await writeFile(entry, `import {serveSandboxedStdio} from ${JSON.stringify(pathToFileURL(resolve("packages/runtime-supervisor/dist/sandbox-runtime.js")).href)};const server=await serveSandboxedStdio(${JSON.stringify(options)});await server.closed;`);
    const metadata = { session_id: "independent-browser", turn_id: "one" };
    if(rustRuntime) rust=await prepareIndependentBrowserRuntime({CUA_REPL_ENABLED_SURFACES:'browser',CORE_CUA_ENDPOINT_FILES:JSON.stringify([endpointFile]),BROWSER_USE_BACKEND_PATHS:host.endpoint.socketPath,BROWSER_USE_AVAILABLE_BACKENDS:'cdp'},staged.root,'independent-browser','rust');
    const client = await McpToolClient.connect(rust ? {command:rust.command,args:rust.args,cwd:root,env:rust.environment,stderr:'inherit'} : {command:process.execPath,args:[entry],cwd:root,env:{HOME:root,TMPDIR:root},stderr:"inherit"}, {
      requestMeta: () => ({ "x-codex-turn-metadata": metadata }),
      elicit: async params => params.mode !== "url" && params._meta?.tool_name === "access_browser_origin" && params._meta?.origin === origin
        ? { action: "accept", content: {} } : { action: "decline" },
    });
    turn = new NodeReplTurnClient(client, {...metadata,hook_event_name:"turn_ended"});
    let count = 0;
    const execute = async (code: string) => {
      const result = await turn!.callTool({id:String(++count),name:"js",arguments:{code}}, AbortSignal.timeout(15000));
      assert.equal(result.isError, false, JSON.stringify(result));
      return result;
    };
    const bootstrapCode = 'await import("@core/cua/tinyskyAlt");';
    const bootstrapResult = await execute(bootstrapCode);
    if (liveModel) {
      loadEnvFile(resolve(".env"));
      const trace = createTerminalTrace();
      const initialMessages = await browserPreflight(turn, { onMessage: trace });
      const result = await new AgentLoop(createDemoModel(), turn).run(
        `Open ${origin} in Chrome, fill Query with ${query}, submit the form, take a screenshot of the result page and report its paragraph. Actually operate the page.`,
        { initialMessages: [
            { role: "assistant", toolCalls: [{ id: "1", name: "js", arguments: { code: bootstrapCode } }] },
            { role: "tool", callId: "1", name: "js", result: bootstrapResult },
            ...initialMessages,
          ], runtimeContext: `${BROWSER_INPUT_CONTEXT}\n${CDP_OPERATION_CONTEXT}`, onMessage: trace, signal: AbortSignal.timeout(90000) },
      );
      assert(result.answer.includes(marker));
      assert.deepEqual(submissions, [query]);
      assert(result.messages.some(m => m.role === "tool" && m.result.content.some(c => c.type === "image")));
      const failures = result.messages.filter(m => m.role === "tool" && m.result.isError);
      assert.deepEqual(failures, []);
      console.error("INDEPENDENT DEEPSEEK ANSWER", result.answer);
      console.error("INDEPENDENT DEEPSEEK DECISIONS", result.messages.filter(m => m.role === "assistant").length - 3);
    } else {
      await execute('await cua.getState();');
      await execute(`var tab = await cua.createBrowserTab("1", ${JSON.stringify(origin)}, {sessionName:"Independent runtime acceptance"});`);
      await execute(`await tab.playwright.getByRole("textbox",{name:"Query"}).fill(${JSON.stringify(query)}); await tab.playwright.getByRole("button",{name:"Submit"}).click();`);
      const observed = await execute('await tab.getAXState();');
      assert(JSON.stringify(observed.content).includes(marker));
      assert.deepEqual(submissions, [query]);
      const screenshot = await execute('await tab.getScreenshot();');
      assert(screenshot.content.some(item => item.type === "image" && item.data.length > 100));
    }
  } finally {
    try { await turn?.endTurn(); } finally {
      await turn?.close();
      await rust?.dispose();
      await host?.close();
      await staged?.dispose();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(root, {recursive:true,force:true});
    }
  }
});

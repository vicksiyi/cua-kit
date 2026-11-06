import { discoverLiveEndpointFiles, createBrowserServiceConnector } from "@core/native-host/browserConnector";
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
import { mkdtemp, rm, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { startCdpHost } from "../packages/cdp-host/src/host";
import { stageRuntimePackages } from "../packages/agent-loop/src/runtime-packages";
import { McpToolClient } from "../packages/agent-loop/src/mcp-client";
import { NodeReplTurnClient } from "../packages/agent-loop/src/node-repl-turn";

/** Real browser and OS-sandboxed restored workers, without the installed supervisor. */
test("independent sandboxed supervisor executes real browser input, click, read and screenshot over MCP", {
  skip: process.platform !== "darwin" || process.env.CUA_TEST_MACOS_SANDBOX !== "1",
  timeout: 120000,
}, async () => {
  const liveModel = process.env.CUA_LIVE_DEEPSEEK_TEST === "1";
  const query = `independent-query-${randomUUID()}`;
  const marker = `observed-${randomUUID()}`;
  const submissions: string[] = [];
  const frameSubmissions: string[] = [];
  const frameMarker = `frame-observed-${randomUUID()}`;
  let frameOrigin = "";
  const frameServer = createServer((req, res) => {
    const url = new URL(req.url!, "http://fixture.invalid");
    res.setHeader("content-type", "text/html");
    if (url.pathname === "/submit") {
      frameSubmissions.push(url.searchParams.get("query") ?? "");
      res.end(`<p>${frameMarker}</p>`);
    } else res.end('<form action="/submit"><label>Frame query<input name="query"></label><button>Save frame</button></form>');
  });
  const server = createServer((req, res) => {
    const url = new URL(req.url!, "http://fixture.invalid");
    res.setHeader("content-type", "text/html");
    if (url.pathname === "/frame-host") {
      res.end(`<h1>Owned cross-origin frame</h1><iframe title="Owned frame" src="${frameOrigin}"></iframe>`);
    } else if (url.pathname === "/submit") {
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
  const dailyDirectory = process.env.CUA_TEST_DAILY_CHROME_ENDPOINT_DIRECTORY;
  let dailyTabCreated=false;
  const cleanupDailyTab=async()=>{
    if(dailyTabCreated && turn){
      const closed=await turn.callTool({id:"fixture-cleanup",name:"js",arguments:{code:"await fixtureTab.close();"}},AbortSignal.timeout(10000));
      assert.equal(closed.isError,false,"Owned daily fixture tab cleanup failed");
      dailyTabCreated=false;
    }
  };
  try {
    await new Promise<void>(resolve => frameServer.listen(0, "127.0.0.1", resolve));
    const frameAddress = frameServer.address();
    assert(frameAddress && typeof frameAddress !== "string");
    frameOrigin = `http://127.0.0.1:${frameAddress.port}`;
    let browserEnvironment: Record<string,string>;
    if (dailyDirectory) {
      const files=await discoverLiveEndpointFiles(dailyDirectory);
      const connector=await createBrowserServiceConnector(files);
      browserEnvironment={CORE_CUA_ENDPOINT_FILES:JSON.stringify(files),...connector.environment};
    } else {
      host = await startCdpHost({ headless: true });
      const endpointFile = await realpath(host.endpointFile);
      assert.equal(host.endpointFile, endpointFile);
      browserEnvironment={CORE_CUA_ENDPOINT_FILES:JSON.stringify([endpointFile]),BROWSER_USE_BACKEND_PATHS:host.endpoint.socketPath,BROWSER_USE_AVAILABLE_BACKENDS:'cdp'};
    }
    staged = await stageRuntimePackages([resolve("packages/native-host"), resolve("packages/cua")]);
    const metadata = { session_id: "independent-browser", turn_id: "one" };
    rust=await prepareIndependentBrowserRuntime({CUA_REPL_ENABLED_SURFACES:'browser',...browserEnvironment},staged.root,'independent-browser','rust');
    const client = await McpToolClient.connect({command:rust.command,args:rust.args,cwd:root,env:rust.environment,stderr:'inherit'}, {
      requestMeta: () => ({ "x-codex-turn-metadata": metadata }),
      elicit: async params => params.mode !== "url" && params._meta?.tool_name === "access_browser_origin" && [origin,frameOrigin].includes(String(params._meta?.origin))
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
      const initialMessages = dailyDirectory ? [] : await browserPreflight(turn, { onMessage: trace });
      if(dailyDirectory){
        const code=`var fixtureTab = await cua.createBrowserTab("1", ${JSON.stringify(origin)}, {sessionName:"DeepSeek local acceptance"});`;
        const result=await execute(code);
        dailyTabCreated=true;
        initialMessages.push(
          {role:"assistant",toolCalls:[{id:"fixture-open",name:"js",arguments:{code}}]},
          {role:"tool",callId:"fixture-open",name:"js",result},
        );
      }
      const loopTools = dailyDirectory ? {
        getInstructions:()=>turn!.getInstructions(),
        listTools:(signal?:AbortSignal)=>turn!.listTools(signal),
        callTool:turn.callTool.bind(turn),
        endTurn:async()=>{try{await cleanupDailyTab();}finally{await turn!.endTurn();}},
        close:()=>turn!.close(),
      } : turn;
      const result = await new AgentLoop(createDemoModel(), loopTools).run(
        `${dailyDirectory ? 'Use only the already-open fixtureTab in daily Chrome; do not open or inspect other tabs. Keep fixtureTab available for cleanup.' : `Open ${origin} in the isolated Chromium browser.`} Fill Query with ${query}, submit the form, take a screenshot of the result page and report its paragraph. Actually operate the page.`,
        { initialMessages: [
            { role: "assistant", toolCalls: [{ id: "1", name: "js", arguments: { code: bootstrapCode } }] },
            { role: "tool", callId: "1", name: "js", result: bootstrapResult },
            ...initialMessages,
          ], runtimeContext: `${BROWSER_INPUT_CONTEXT}\n${dailyDirectory ? 'The existing Chrome extension backend is selected. Use only the provided local fixture tab.' : CDP_OPERATION_CONTEXT}`, onMessage: trace, signal: AbortSignal.timeout(90000) },
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
      if(dailyDirectory) {
        await execute('var fixtureTab = tab;');
        dailyTabCreated=true;
      }
      await execute(`await tab.playwright.getByRole("textbox",{name:"Query"}).fill(${JSON.stringify(query)}); await tab.playwright.getByRole("button",{name:"Submit"}).click();`);
      const observed = await execute('await tab.getAXState();');
      assert(JSON.stringify(observed.content).includes(marker));
      assert.deepEqual(submissions, [query]);
      const screenshot = await execute('await tab.getScreenshot();');
      assert(screenshot.content.some(item => item.type === "image" && item.data.length > 100));
      await execute(`await tab.goto(${JSON.stringify(origin + "/frame-host")}); await tab.getAXState();`);
      await execute(`await tab.playwright.frameLocator('iframe[title="Owned frame"]').getByRole("textbox",{name:"Frame query"}).fill(${JSON.stringify(query)}); await tab.playwright.frameLocator('iframe[title="Owned frame"]').getByRole("button",{name:"Save frame"}).click();`);
      const frameResult = await execute(`nodeRepl.write(await tab.playwright.frameLocator('iframe[title="Owned frame"]').locator("p").innerText());`);
      assert(JSON.stringify(frameResult.content).includes(frameMarker));
      assert.deepEqual(frameSubmissions, [query]);
      if(dailyDirectory) await cleanupDailyTab();
    }
  } catch (error) {
    console.error("BROWSER ACCEPTANCE FAILURE",error);
    throw error;
  } finally {
    try {
      try {
        await cleanupDailyTab();
      } finally { await turn?.endTurn(); }
    } finally {
      await turn?.close();
      await rust?.dispose();
      await host?.close();
      await staged?.dispose();
      frameServer.closeAllConnections();
      await new Promise<void>(resolve => frameServer.close(() => resolve()));
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(root, {recursive:true,force:true});
    }
  }
});

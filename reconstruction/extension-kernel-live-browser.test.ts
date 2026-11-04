import { createServer } from "node:http";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";

test(
  "real kernel executes JS, claims an existing tab, captures JPEG and clicks the page",
  { timeout: 60000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "core-kernel-live-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const extension = join(root, "extension");
    await mkdir(extension);
    execFileSync(process.execPath, ["scripts/build-reconstructed-kernel.mjs"], {
      cwd: resolve("."),
      stdio: "pipe",
    });
    await cp("packages/browser-extension/dist/kernel", extension, {
      recursive: true,
    });
    execFileSync(
      process.execPath,
      ["scripts/build-reconstructed-content.mjs"],
      { cwd: resolve("."), stdio: "pipe" },
    );
    await cp(
      "packages/browser-extension/dist/content-scripts",
      join(extension, "content-scripts"),
      { recursive: true },
    );
    await writeFile(
      join(extension, "manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        name: "Core kernel execution fixture",
        version: "1.0.0",
        permissions: [
          "offscreen",
          "storage",
          "tabs",
          "tabGroups",
          "debugger",
          "scripting",
          "webNavigation",
          "webRequest",
          "declarativeNetRequest",
          "alarms",
        ],
        host_permissions: ["http://127.0.0.1/*"],
        background: { service_worker: "background.js", type: "module" },
        sandbox: { pages: ["js-kernel.html"] },
        content_security_policy: {
          extension_pages: "script-src 'self'; object-src 'none';",
          sandbox:
            "sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-eval'; worker-src blob:; connect-src 'none';",
        },
      }),
    );
    // Auth/settings/site-status are explicit fixtures limited to the local page; no
    // external network is allowed. The MCP
    // dispatcher, scope/control RPC, offscreen, sandbox, Worker and Ports are real.
    await build({
      stdin: {
        resolveDir: resolve("."),
        loader: "ts",
        contents: `
    import {createKernelTunnelRuntime} from './packages/browser-extension/src/kernel_tunnel_runtime';
    import {registerKernelConnections} from './packages/browser-extension/src/kernel_transport';
    import {createKernelControlClass,KernelControlPeer} from './packages/browser-extension/src/kernel_control';
    import {createExtensionBrowserFoundation} from './packages/browser-extension/src/browser_foundation';
    import {ExtensionBrowserPeer} from './packages/browser-extension/src/browser_peer';
    import {createChatApiClass} from './packages/browser-extension/src/chat_api';
    const setTimeout=globalThis.setTimeout.bind(globalThis),clearTimeout=globalThis.clearTimeout.bind(globalThis);
    const network=async(input)=>{
      const url=new URL(String(input));
      if(url.href==='https://chatgpt.com/backend-api/wham/browser/settings') return Response.json({revision:1,preferences:{approval_mode:'always_ask'},rules:{origin:{[globalThis.fixtureOrigin]:'allow'},download:{},upload:{},full_cdp:{},webmcp:{}}});
      if(url.pathname==='/backend-api/aura/site_status' && new URL(url.searchParams.get('site_url')).origin===globalThis.fixtureOrigin) return Response.json({feature_status:{agent:false}});
      throw Error('unexpected external network: '+url.origin+url.pathname);
    };
    const env={fetch:network,now:()=>performance.now(),wallNow:Date.now,random:Math.random,
      randomUUID:()=>crypto.randomUUID(),setTimeout,clearTimeout,version:()=> 'fixture',online:()=>true,
      warn(){},reportPollingState(){},reportResponseFailure(){}};
    const runtime=createKernelTunnelRuntime({
      ChatApi:createChatApiClass({fetch:network,setTimeout,clearTimeout}),
      kernelHost:{runtime:chrome.runtime,offscreen:chrome.offscreen,randomUUID:()=>crypto.randomUUID()},
      storage:chrome.storage.sync,randomUUID:()=>crypto.randomUUID(),browserShortDisplayName:()=> 'Chrome',warn(){}
    });
    const Control=createKernelControlClass({getScope:runtime.getScope,storage:chrome.storage.session,
      fetch:network,siteStatusUrl:new URL('https://fixture.invalid/status'),defaultAllowedPages:[],
      getConfig:async()=>undefined,isEnabled:async()=>true,
      capturePdf:async()=>{throw Error('PDF not requested')},deletePdf:async()=>{throw Error('PDF not requested')}
    });
    const foundation=createExtensionBrowserFoundation({chrome,crypto,now:Date.now,setTimeout,clearTimeout,error(){},fetch:network});
    const Handler=foundation.createHandlerClass({navigator},{metric(){},warn(){}});
    const handler=new Handler({});
    registerKernelConnections(chrome.runtime,(scopeId,browser,control)=>{
      new KernelControlPeer(control,new Control(scopeId));new ExtensionBrowserPeer(browser,handler);
    });
    const tunnel=runtime.createTunnel({baseUrl:'https://fixture.invalid',tunnelId:'fixture',apiKey:'fixture-only',
      account:{id:'account',userId:'user',structure:'personal'}},env,async()=>{});
    globalThis.run=async(code,session='session')=>{
      // Explicit test consent in a fresh temporary profile, never a user's profile.
      await chrome.storage.sync.set({browserUseControlAllowed:true});
      const signal=new AbortController().signal;
      return tunnel.getMcpResponse({command_type:'jsonrpc',channel:session,request_id:crypto.randomUUID(),jsonrpc:{
        id:7,method:'tools/call',params:{name:'js',arguments:{code,instance_id:'fixture'},
          _meta:{'x-codex-turn-metadata':{session_id:session,turn_id:'turn'}}}
      }},null,signal,signal);
    };
    globalThis.reset=()=>tunnel.kernel.onSessionTerminated({channel:'session'});
  `,
      },
      outfile: join(extension, "background.js"),
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "chrome120",
    });
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        `<title>Kernel browser fixture</title><button onclick="this.textContent='Clicked'">Press me</button>`,
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    t.after(
      () => new Promise<void>((resolve) => server.close(() => resolve())),
    );
    const port = (server.address() as any).port;
    const context = await chromium.launchPersistentContext(
      join(root, "profile"),
      {
        channel: "chromium",
        headless: true,
        args: [
          `--disable-extensions-except=${extension}`,
          `--load-extension=${extension}`,
        ],
      },
    );
    try {
      const worker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent("serviceworker"));
      await worker.evaluate((origin) => {
        globalThis.fixtureOrigin = origin;
      }, `http://127.0.0.1:${port}`);
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}/`);
      const listing: any = await worker.evaluate(
        `run('var agent = await setupBrowserRuntime(); await nodeRepl.write(await agent.browsers.list())')`,
      );
      assert.notEqual(
        listing.resp_json.result.isError,
        true,
        JSON.stringify(listing),
      );
      assert.match(JSON.stringify(listing.resp_json.result.content), /Chrome/);
      const tabs: any = await worker.evaluate(
        `run('var browser = await agent.browsers.get("0"); var userTabs=await browser.user.openTabs(); await nodeRepl.write(userTabs)')`,
      );
      assert.notEqual(
        tabs.resp_json.result.isError,
        true,
        JSON.stringify(tabs),
      );
      assert.match(
        JSON.stringify(tabs.resp_json.result.content),
        /Kernel browser fixture/,
      );
      const acquired: any = await worker.evaluate(
        `run('var tab = await browser.user.claimTab(userTabs.find(t=>t.title==="Kernel browser fixture")); await nodeRepl.write(await tab.url())')`,
      );
      assert.notEqual(
        acquired.resp_json.result.isError,
        true,
        JSON.stringify(acquired),
      );
      assert.match(
        JSON.stringify(acquired.resp_json.result.content),
        /127.0.0.1/,
      );
      const screenshot: any = await worker.evaluate(
        `run('var screenshot = await tab.screenshot({}); await nodeRepl.write({length:screenshot.length,header:Array.from(screenshot.slice(0,3))})')`,
      );
      assert.notEqual(
        screenshot.resp_json.result.isError,
        true,
        JSON.stringify(screenshot),
      );
      const screenshotInfo = JSON.parse(
        screenshot.resp_json.result.content[0].text,
      );
      assert.ok(screenshotInfo.length > 100);
      assert.deepEqual(screenshotInfo.header, [255, 216, 255]);
      const clicked: any = await worker.evaluate(
        `run('await tab.cua.click({x:40,y:18}); await nodeRepl.write("clicked")')`,
      );
      assert.notEqual(
        clicked.resp_json.result.isError,
        true,
        JSON.stringify(clicked),
      );
      assert.equal(await page.locator("button").textContent(), "Clicked");
      const first: any = await worker.evaluate(
        `run('var answer = 40; await nodeRepl.write(answer + 2)')`,
      );
      assert.deepEqual(first.resp_json.result.content, [
        { type: "text", text: "42" },
      ]);
      const second: any = await worker.evaluate(
        `run('await nodeRepl.write(answer + 3)')`,
      );
      assert.deepEqual(second.resp_json.result.content, [
        { type: "text", text: "43" },
      ]);
      const isolated: any = await worker.evaluate(
        `run('await nodeRepl.write(typeof answer)', 'other-session')`,
      );
      assert.deepEqual(isolated.resp_json.result.content, [
        { type: "text", text: "undefined" },
      ]);
      const failed: any = await worker.evaluate(
        `run('var failedBinding = 9; throw new Error("intentional fixture failure")')`,
      );
      assert.equal(failed.resp_json.result.isError, true);
      const preserved: any = await worker.evaluate(
        `run('await nodeRepl.write([answer, typeof failedBinding])')`,
      );
      assert.deepEqual(preserved.resp_json.result.content, [
        { type: "text", text: '[40,"undefined"]' },
      ]);
      await worker.evaluate(`reset()`);
      const reset: any = await worker.evaluate(
        `run('await nodeRepl.write(typeof answer)')`,
      );
      assert.deepEqual(reset.resp_json.result.content, [
        { type: "text", text: "undefined" },
      ]);
    } finally {
      await context.close();
    }
  },
);

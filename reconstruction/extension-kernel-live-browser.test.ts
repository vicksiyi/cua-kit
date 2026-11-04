import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";

test(
  "real Chrome offscreen, sandbox and worker execute persistent JS and reset scopes",
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
    await writeFile(
      join(extension, "manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        name: "Core kernel execution fixture",
        version: "1.0.0",
        permissions: ["offscreen", "storage"],
        background: { service_worker: "background.js", type: "module" },
        sandbox: { pages: ["js-kernel.html"] },
        content_security_policy: {
          extension_pages: "script-src 'self'; object-src 'none';",
          sandbox:
            "sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-eval'; worker-src blob:; connect-src 'none';",
        },
      }),
    );
    // Auth/config are explicit fixtures; no external network is allowed. The MCP
    // dispatcher, scope/control RPC, offscreen, sandbox, Worker and Ports are real.
    await build({
      stdin: {
        resolveDir: resolve("."),
        loader: "ts",
        contents: `
    import {createKernelTunnelRuntime} from './packages/browser-extension/src/kernel_tunnel_runtime';
    import {registerKernelConnections} from './packages/browser-extension/src/kernel_transport';
    import {createKernelControlClass,KernelControlPeer} from './packages/browser-extension/src/kernel_control';
    import {createChatApiClass} from './packages/browser-extension/src/chat_api';
    const network=async()=>{throw Error('unexpected external network')};
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
    registerKernelConnections(chrome.runtime,(scopeId,browser,control)=>new KernelControlPeer(control,new Control(scopeId)));
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

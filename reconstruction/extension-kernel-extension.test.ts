import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, cp, rm } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

test("kernel executes inside an unpacked extension under original sandbox CSP", {timeout:30000}, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cua-kernel-extension-"));
  t.after(() => rm(root,{recursive:true,force:true}));
  const extension = join(root, "extension");
  await cp("packages/browser-extension/dist/kernel", extension, {recursive:true});
  const sourceRoot = process.env.CUA_EXTENSION_SOURCE_ROOT ?? join(homedir(), "Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0");
  const manifest = JSON.parse(await readFile(join(sourceRoot, "manifest.json"), "utf8"));
  await writeFile(join(extension,"manifest.json"), JSON.stringify({
    manifest_version:3,name:"Reconstructed kernel integration fixture",version:"1.0.0",
    permissions:["offscreen"],background:{service_worker:"background.js"},
    sandbox:manifest.sandbox,content_security_policy:manifest.content_security_policy,
  }));
  await build({stdin:{contents:`
import { registerAssembledBackgroundKernel } from './packages/browser-extension/src/kernel_background_assembly';
import { createKernelHostRegistry } from './packages/browser-extension/src/kernel_host';
const content = [], signal = new AbortController().signal;
class Handler {
  moveMouse() {}
  getInfo() { return {type:'extension',family:'chrome',name:'Actual extension fixture',requestHeadersVersion:1}; }
  async turnEnded() {}
}
const peers = registerAssembledBackgroundKernel({
  runtime:chrome.runtime,handler:new Handler(),
  controlHost:{
    getScope:()=>({content,signal,disposalSignal:signal,chatApi:{request:async()=>({})}}),
    siteStatusUrl:new URL('https://chatgpt.com/'),fetch,defaultAllowedPages:[],
    isEnabled:async()=>true,getConfig:async()=>undefined,
    storage: {get:async()=>({}),set:async()=>{}},
  },
  observeGate:async(callback)=>callback(true), registerTurnEnded:async()=>{},
  reportGateError:console.error,reportTurnEndedError:console.error,warn:console.warn,
});
const registry=createKernelHostRegistry({runtime:chrome.runtime,offscreen:chrome.offscreen,randomUUID:()=>crypto.randomUUID()});
globalThis.runKernelFixture=async()=>{
  await registry.ensureOffscreen();
  const kernel=await registry.get('scope');
  const replies=[];
  for(const [id,script] of [
    ['first','var agent = await setupBrowserRuntime(); await nodeRepl.write(await agent.browsers.list()); var count = 1;'],
    ['second','await nodeRepl.write(++count);'],
    ['isolation','await nodeRepl.write({origin:self.origin, extensionApi:typeof chrome});'],
    ['error','throw new TypeError("fixture error");'],
    ['recovery','await nodeRepl.write(++count);'],
  ]) replies.push(await kernel.executeJs(script,undefined,{'x-codex-turn-metadata':{session_id:'scope',turn_id:id}}));
  const activePeers=peers.size;
  await registry.reset('scope');
  return {replies,content,activePeers,remainingPeers:peers.size};
};
`,resolveDir:resolve('.'),loader:'ts'},bundle:true,platform:'browser',format:'iife',outfile:join(extension,'background.js')});
  const context = await chromium.launchPersistentContext(join(root,"profile"), {
    channel:"chromium",headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const result = await worker.evaluate(async()=>await (globalThis as any).runKernelFixture());
    assert.deepEqual(result.replies.map((r:any)=>r.error?.name ?? "ok"),["ok","ok","ok","TypeError","ok"]);
    assert.equal(result.activePeers,1);
    assert.equal(result.remainingPeers,0);
    const texts=result.content.filter((x:any)=>x.type==='text').map((x:any)=>x.text);
    assert.match(texts[0],/Actual extension fixture/);
    assert.equal(texts[1],'2');
    assert.deepEqual(JSON.parse(texts[2]),{origin:'null',extensionApi:'undefined'});
    assert.equal(texts[3],'3');
  } finally { await context.close(); }
});

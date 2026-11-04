import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { parse } from "acorn";
import { createKernelWorkerFactory } from "../packages/browser-extension/src/kernel_worker_factory";
const root = process.env.CUA_EXTENSION_SOURCE_ROOT ?? `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
export const originalSandboxSource = readFileSync(`${root}/chunks/js-kernel-BMrODGlb.js`, "utf8");
assert.equal(createHash("sha256").update(originalSandboxSource).digest("hex"), "eb67d89be4d7ec9535ad3f0e4f690bf36f2bec156f3d4e314e4bb7ff7d44a2f6");
const ast = parse(originalSandboxSource, { ecmaVersion: "latest", sourceType: "module" }) as any;
const h = ast.body.find((n: any) => n.type === "FunctionDeclaration" && n.id.name === "h");
const o = ast.body.flatMap((n: any) => n.declarations ?? []).find((d: any) => d.id.name === "o");
test("worker factory matches original Blob construction, failure fallback and URL cleanup", () => {
  for (const mode of ["normal", "no-blob", "url-failure", "worker-failure", "listener-failure", "webkit"]) {
    const outputs = [];
    for (const restored of [false, true]) {
      const trace: any[] = []; let onError: any;
      class Blob { constructor(parts: unknown[], options: unknown) { trace.push(["blob",parts,options]); } }
      class Worker {
        constructor(url: string, options: unknown) { trace.push(["worker",url,options]); if (mode === "worker-failure" && url === "blob:fixture") throw Error("worker"); }
        addEventListener(_name: string, callback: any) { if(mode === "listener-failure") throw Error("listen"); onError = callback; }
      }
      const URL = { createObjectURL() { trace.push("url"); if(mode === "url-failure") throw Error("url"); return "blob:fixture"; }, revokeObjectURL(url: string) { trace.push(["revoke",url]); } };
      const host = { Blob: mode === "no-blob" ? undefined : Blob, Worker, ...(mode === "webkit" ? {webkitURL:URL} : {URL}) };
      const source = 'self.postMessage("你好");';
      const factory = restored ? createKernelWorkerFactory(source, host as any) : new Function("self","Blob","Worker","c",`const ${originalSandboxSource.slice(o.start,o.end)};${originalSandboxSource.slice(h.start,h.end)};return h;`)(host,Blob,Worker,source);
      factory({name:"fixture"}); onError?.();
      outputs.push(trace);
    }
    assert.deepEqual(outputs[1],outputs[0],mode);
  }
});

test("packaged sandbox starts its real worker and forwards agent RPC through an iframe", { timeout: 20000 }, async () => {
  const { build } = await import("esbuild");
  const { chromium } = await import("playwright");
  const { kernelDocumentation } = await import("../packages/browser-extension/src/kernel_documentation");
  const bundle = await build({entryPoints:["packages/browser-extension/src/kernel_sandbox_entry.ts"],bundle:true,platform:"browser",format:"iife",write:false});
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.addScriptTag({content:"globalThis.__name = value => value;"});
    const outputs = await page.evaluate(async ({sources,manifest}) => {
      const outputs = [];
      for(const source of sources) {
        const frame = document.createElement("iframe");
        const trace: unknown[] = []; let agentPort: MessagePort | undefined;
        const ready = Promise.withResolvers<void>();
        const listener = (event: MessageEvent) => {
          if(event.source !== frame.contentWindow) return;
          if(event.data.type === "js-kernel:ready") ready.resolve();
          if(event.data.type === "js-kernel:agent-port") {
            agentPort = event.ports[0];
            agentPort.onmessage = ({data}) => {
              trace.push({method:data.method,params:data.params});
              const result = data.method === "setup" ? {apiManifest:manifest,disabledMemberIds:[]} : data.method === "execute" ? [] : undefined;
              agentPort!.postMessage({jsonrpc:"2.0",id:data.id,result});
            };
          }
        };
        window.addEventListener("message",listener);
        frame.onload = () => frame.contentWindow!.eval(source);
        frame.srcdoc = "<html><body></body></html>";
        document.body.append(frame);
        try {
          await ready.promise;
          const results=[];
          for(const [id,script] of [
            ["first",'var agent = await setupBrowserRuntime(); await nodeRepl.write(await agent.browsers.list()); var retained = 10;'],
            ["second",'await nodeRepl.write(retained + 1);'],
            ["failure",'throw new TypeError("fixture");'],
            ["recovered",'await nodeRepl.write(retained + 2);'],
          ]) {
            const channel = new MessageChannel();
            try {
              const reply = new Promise<any>(resolve => {channel.port1.onmessage=event=>resolve(event.data);});
              frame.contentWindow!.postMessage({id,script,type:"js-kernel:execute"},"*",[channel.port2]);
              const result=await reply;
              results.push({id:result.id,ok:result.ok,...(result.error?{error:{name:result.error.name,message:result.error.message}}:{})});
            } finally {channel.port1.close();channel.port2.close();}
          }
          outputs.push({trace,results});
        } finally {window.removeEventListener("message",listener);agentPort?.close();frame.remove();}
      }
      return outputs;
    },{sources:[originalSandboxSource,bundle.outputFiles[0].text],manifest:kernelDocumentation.default!.apiManifest});
    assert.deepEqual(outputs[1],outputs[0]);
    assert.deepEqual(outputs[1].results.map(result=>result.ok),[true,true,false,true]);
  } finally {await browser.close();}
});

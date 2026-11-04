import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

test("built host and sandbox pages execute actual worker/browser service across nested frames", {timeout:20000}, async () => {
  const files = new Map<string, Buffer>();
  for(const name of ["js-kernel-host.html","js-kernel-host.js","js-kernel.html","js-kernel.js"]) files.set('/'+name,await readFile(`packages/browser-extension/dist/kernel/${name}`));
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.route("https://kernel.test/**", route => {
      const pathname = new URL(route.request().url()).pathname;
      return route.fulfill({contentType:pathname.endsWith('.js')?'text/javascript':'text/html',body:files.get(pathname) ?? Buffer.from('<html><body></body></html>')});
    });
    await page.addInitScript(() => {
      (globalThis as any).__name = (value: unknown) => value;
      const fixture = {requests:[] as any[],disconnected:0};
      (globalThis as any).kernelFixture=fixture;
      (globalThis as any).chrome = {runtime:{
        getURL:(name:string)=>'https://kernel.test/'+name,
        connect:({name}:{name:string})=>{
          fixture.requests.push({connection:name});
          let receive:any; const closeListeners:any[]=[];
          return {
            onMessage:{addListener(callback:any){receive=callback;}},
            onDisconnect:{addListener(callback:any){closeListeners.push(callback);}},
            disconnect(){fixture.disconnected++;for(const callback of closeListeners)callback();},
            postMessage(message:any){
              if(!message.method)return;
              fixture.requests.push(message);
              let result:any=null;
              if(message.method==='isBrowserElicitationEnabled')result=true;
              if(message.method==='getInfo')result={type:'extension',family:'chrome',name:'Page-chain fixture',requestHeadersVersion:1};
              if(message.method==='readRequirements')result={};
              queueMicrotask(()=>receive({id:message.id,...(message.type?{type:message.type}:{}),result}));
            },
          };
        },
      }};
    });
    await page.goto('https://kernel.test/');
    const results=await page.evaluate(async()=>{
      const frame=document.createElement('iframe');
      const ready=Promise.withResolvers<void>();
      const listener=(event:MessageEvent)=>{if(event.source===frame.contentWindow&&event.data.type==='js-kernel:host-ready')ready.resolve();};
      window.addEventListener('message',listener);
      frame.src='https://kernel.test/js-kernel-host.html?scopeId=scope';document.body.append(frame);
      try {
        await ready.promise;
        const send=async(message:any)=>{
          const channel=new MessageChannel();
          try {
            const reply=new Promise<any>(resolve=>{channel.port1.onmessage=event=>resolve(event.data);});
            frame.contentWindow!.postMessage({...message,scopeId:'scope'},'*',[channel.port2]);return await reply;
          } finally{channel.port1.close();channel.port2.close();}
        };
        const replies=[];
        for(const [id,script] of [
          ['first','var agent = await setupBrowserRuntime(); await nodeRepl.write(await agent.browsers.list()); var count = 1;'],
          ['second','await nodeRepl.write(++count);'],
          ['failure','throw new TypeError("script failure");'],
          ['recovered','await nodeRepl.write(++count);'],
        ]) replies.push(await send({id,script,type:'js-kernel:execute',requestMeta:{'x-codex-turn-metadata':{session_id:'scope',turn_id:id}}}));
        const cleanup=await send({id:'cleanup',type:'js-kernel:reset'});
        return {replies,cleanup,fixture:(frame.contentWindow as any).kernelFixture,sandboxCount:frame.contentDocument!.querySelectorAll('iframe').length};
      } finally{window.removeEventListener('message',listener);frame.remove();}
    });
    assert.deepEqual(results.replies.map((r:any)=>r.ok),[true,true,false,true]);
    assert.equal(results.replies[2].error.message,'script failure');
    assert.equal(results.replies[2].resetRequired,undefined);
    assert.equal(results.cleanup.ok,true);
    assert.equal(results.sandboxCount,0);
    assert.equal(results.fixture.requests.filter((r:any)=>r.method==='getInfo').length,1);
    const values=results.fixture.requests.filter((r:any)=>r.method==='displayValue').map((r:any)=>r.params);
    assert.equal(values[0][0].name,'Page-chain fixture');
    assert.deepEqual(values.slice(1),[2,3]);
    assert.equal(results.fixture.disconnected,1);
  } finally{await browser.close();}
});

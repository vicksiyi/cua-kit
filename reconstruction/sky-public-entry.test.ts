import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
const exec = promisify(execFile);
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const original = pathToFileURL(
  `${root}/sky/dist/project/cua/sky_js/src/index.js`,
).href;
const originalService = pathToFileURL(
  `${root}/sky/dist/project/cua/sky_js/src/service.js`,
).href;
const program = String.raw`
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {writeFileSync} from 'node:fs';
const mode=process.env.SCENARIO,trace=[];
const error=async(run)=>{try{return {value:await run()};}catch(e){return {error:e.message,name:e.name};}};
if(mode==='rpc'){
 class Pipe extends EventEmitter{
 write(bytes){const message=JSON.parse(Buffer.from(bytes).subarray(4).toString());trace.push(message);queueMicrotask(()=>{const result=message.params.method==='list_windows'?[{app:'fixture',id:1}]:null;const payload=Buffer.from(JSON.stringify({id:message.id,result}));const header=Buffer.alloc(4);header.writeUInt32LE(payload.length);this.emit('data',Buffer.concat([header,payload]));});}
 end(){}
 }
 const pipe=new Pipe();globalThis.nodeRepl={config:{},env:{SKY_CUA_NATIVE_PIPE:'1',SKY_CUA_NATIVE_PIPE_DIRECTORY:'fixture'},requestMeta:{session_id:'fixture',turn_id:'t'},nativePipe:{createConnection:async()=>pipe}};
 const {handleRpc}=await import(process.env.SERVICE);
 globalThis.nodeRepl.rpc=async(name,request)=>{assert.equal(name,'sky');return handleRpc(request);};
 const {sky}=await import(process.env.ENTRY);
 const windows=await sky.list_windows();await sky.click({window:windows[0],x:1.5,y:2.5});
 const rejected=await error(()=>handleRpc({type:'execute',method:'close',args:[]}));
 console.log(JSON.stringify({target:sky.target,windows,methods:Object.keys(sky),trace,rejected}));
}else if(mode==='direct'){
 delete globalThis.nodeRepl;
 const {sky}=await import(process.env.ENTRY);
 writeFileSync(process.env.OAI_SKY_CONFIG_PATH,JSON.stringify({target:'linux',post_action_sleep_ms:0}));
 const again=await import(process.env.ENTRY);assert.equal(again.sky,sky);
 console.log(JSON.stringify({target:sky.target,methods:Object.keys(sky)}));
}else if(mode==='failure'){
 globalThis.nodeRepl={rpc:async()=>{throw new Error('fixture setup failure');}};
 const {sky}=await import(process.env.ENTRY);console.log(JSON.stringify({keys:Object.keys(sky),failure:await error(()=>sky.list_windows())}));
}else{
 globalThis.nodeRepl={};const {sky}=await import(process.env.ENTRY);console.log(JSON.stringify(await error(()=>sky.target)));
}
`;
for (const scenario of ["rpc", "direct", "failure", "untrusted"])
  test(`Sky public entry matches original ${scenario} mode`, async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cua-sky-public-")),
      config = path.join(dir, "options.json");
    try {
      const results = [];
      for (const [entry, service] of [
        [original, originalService],
        ["@core/sky", "@core/sky/service"],
      ]) {
        if (scenario === "direct") await rm(config, { force: true });
        else await writeFile(config, JSON.stringify({ target: "windows" }));
        const run = await exec(
          process.execPath,
          ["--input-type=module", "-e", program],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              ENTRY: entry,
              SERVICE: service,
              SCENARIO: scenario,
              OAI_SKY_CONFIG_PATH: config,
              SKY_ENABLE_AUDIO: "0",
              CODEX_DISABLE_ANALYTICS: "1",
            },
            timeout: 10000,
          },
        );
        results.push(JSON.parse(run.stdout.trim()));
      }
      assert.deepEqual(results[1], results[0]);
      if (scenario === "rpc") {
        assert.equal(results[1].trace[1].params.params.x, 2);
        assert.equal(results[1].trace[1].params.params.y, 3);
        assert.match(results[1].rejected.error, /not available: close/);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

test("public cua globals reach assembled Sky service and Windows pipe through getApp and click", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cua-sky-global-"));
  const config = path.join(dir, "config.json");
  await writeFile(config, JSON.stringify({ target: "windows" }));
  try {
    const code = String.raw`
      import {EventEmitter} from 'node:events';
      import assert from 'node:assert/strict';
      const trace=[],writes=[],images=[];
      class Pipe extends EventEmitter {
        write(bytes) {
          const q=JSON.parse(Buffer.from(bytes).subarray(4).toString());trace.push(q.params);
          const window={app:'fixture',id:1};
          const result=q.params.method==='get_window'?window:q.params.method==='get_window_state'?{window,screenshots:q.params.params.include_screenshot?[{url:'data:image/png;base64,AQID',id:'s',zIndex:0}]:[],accessibility:{tree:'fixture tree'}}:null;
          const payload=Buffer.from(JSON.stringify({id:q.id,result})),header=Buffer.alloc(4);header.writeUInt32LE(payload.length);
          queueMicrotask(()=>this.emit('data',Buffer.concat([header,payload])));
        }
        end(){}
      }
      const pipe=new Pipe();
      globalThis.nodeRepl={config:{},env:{CUA_REPL_ENABLED_SURFACES:'computer',SKY_CUA_NATIVE_PIPE:'1',SKY_CUA_NATIVE_PIPE_DIRECTORY:'fixture'},nativePipe:{createConnection:async()=>pipe},write:(value,tag)=>writes.push(tag),emitImage:value=>images.push(value)};
      const {handleRpc}=await import('@core/sky/service');
      globalThis.nodeRepl.rpc=(name,request)=>{assert.equal(name,'sky');return handleRpc(request);};
      await import('@core/cua/tinyskyAlt');
      const app=await cua.getApp({windowId:1});
      await app.click([10.2,20.8]);
      await assert.rejects(app.getScreenshot({emit:false}), /emit: false is unavailable/);
      const screenshot=await app.getScreenshot();
      assert.deepEqual([...screenshot],[1,2,3]);
      assert.deepEqual(trace.map(q=>q.method),['get_window','get_window_state','click','get_window_state']);
      assert.equal(trace[2].params.x,10);assert.equal(trace[2].params.y,21);
      assert.ok(writes.length>0);assert.equal(images.length,1);
      console.log(JSON.stringify({methods:trace.map(q=>q.method),bytes:[...screenshot]}));
    `;
    const result = await exec(
      process.execPath,
      ["--input-type=module", "-e", code],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          OAI_SKY_CONFIG_PATH: config,
          SKY_ENABLE_AUDIO: "0",
          CODEX_DISABLE_ANALYTICS: "1",
        },
        timeout: 10000,
      },
    );
    assert.deepEqual(JSON.parse(result.stdout).bytes, [1, 2, 3]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

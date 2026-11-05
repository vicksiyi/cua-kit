import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {prepareIndependentRuntime} from '../packages/agent-loop/src/independent-runtime';
import {stageRuntimePackages} from '../packages/agent-loop/src/runtime-packages';
import {McpToolClient} from '../packages/agent-loop/src/mcp-client';
import {create_launch_environment} from '../packages/cua-repl/src/environment';
const skip=process.platform!=='darwin'||process.env.CUA_TEST_NATIVE_SKY_IPC!=='1';
async function runtime(t:any,banner?:string){
 const staged=await stageRuntimePackages([resolve('packages/sky'),resolve('packages/cua')]);t.after(()=>staged.dispose());
 const env=create_launch_environment({env:{CUA_REPL_ENABLED_SURFACES:'computer',CORE_CUA_NATIVE_BACKEND:'swift',...(banner===undefined?{}:{NODE_REPL_JS_BANNER:banner})},instructions_directory:new URL('../packages/cua-repl/instructions/',import.meta.url),platform:'darwin'});
 const configured=Object.fromEntries(Object.entries(env).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
 const runtime=await prepareIndependentRuntime(configured,staged.root,'banner-fixture','rust');t.after(()=>runtime.dispose());
 const spec=JSON.parse(await readFile(runtime.args[0],'utf8'));
 assert.equal(spec.kernel.sandbox.worker_environment.NODE_REPL_JS_BANNER,env.NODE_REPL_JS_BANNER);
 assert.equal(spec.trusted.sandbox.worker_environment.NODE_REPL_JS_BANNER,undefined);
 const client=await McpToolClient.connect({command:runtime.command,args:runtime.args,env:runtime.environment,stderr:'ignore'});t.after(()=>client.close());
 let count=0;
 const call=(code:string)=>client.callTool({id:String(++count),name:'js',arguments:{code}});
 const text=(result:any)=>result.content.filter((item:any)=>item.type==='text').map((item:any)=>item.text).join('\n');
 return {client,call,text};
}
test('Rust deployment executes source CUA banner before the first user cell',{skip,timeout:15000},async t=>{
 const f=await runtime(t);
 const result=await f.call('nodeRepl.write(JSON.stringify({initialized:typeof cua.getApp === "function"}));');
 assert.equal(result.isError,false,f.text(result));assert.match(f.text(result),/"initialized":true/);
});
test('Rust deployment preserves banner once-per-kernel, failed-banner retry and reset',{skip,timeout:20000},async t=>{
 const f=await runtime(t,'globalThis.bannerRuns=(globalThis.bannerRuns??0)+1;if(globalThis.bannerRuns===1)throw Error("fixture banner failure");');
 const first=await f.call('nodeRepl.write("body must not run");');assert.equal(first.isError,true);assert.match(f.text(first),/fixture banner failure/);assert.ok(!f.text(first).includes('body must not run'));
 for(let n=0;n<2;n++){
  const result=await f.call('nodeRepl.write(String(globalThis.bannerRuns));');assert.equal(result.isError,false,f.text(result));assert.equal(f.text(result).trim(),'2');
 }
 const reset=await f.client.callTool({id:'reset',name:'js_reset',arguments:{}});assert.equal(reset.isError,false);
 const fresh=await f.call('nodeRepl.write("body must not run");');assert.equal(fresh.isError,true);assert.match(f.text(fresh),/fixture banner failure/);
});

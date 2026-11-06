import test from "node:test";
import {BrowserStartupTools} from "../packages/agent-loop/src/browser-startup-tools";
import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { prepareRestoredRuntime } from "../packages/agent-loop/src/restored-runtime";
import { McpToolClient } from "../packages/agent-loop/src/mcp-client";
import { startRustNativeHost } from "../packages/native-host/src/native_process";
import { ExtensionBrowserPeer } from "../packages/browser-extension/src/browser_peer";
import { NativePipeFrameDecoder, encodeNativePipeFrame } from "../packages/browser/src/service/runtime/native_pipe";

test("same Rust + Swift MCP session discovers a registered browser that starts after initial inventory", {
  skip:process.platform!=="darwin"||process.env.CUA_TEST_NATIVE_SKY_IPC!=="1",timeout:60000,
},async t=>{
  const directory=await realpath(await mkdtemp("/tmp/core-late-"));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const runtime=await prepareRestoredRuntime({
    CUA_REPL_ENABLED_SURFACES:"browser,computer",CUA_REPL_BROWSER_ENV:"codex-app",
    CORE_CUA_NATIVE_BACKEND:"swift",CORE_CUA_HOST_DIRECTORY:directory,
    BROWSER_USE_AVAILABLE_BACKENDS:"chrome",NODE_REPL_DISABLE_ANALYTICS:"1",
  },"rust","late-browser-test");
  t.after(()=>runtime.dispose());
  const client=await McpToolClient.connect({command:runtime.command,args:runtime.args,env:runtime.environment,stderr:"inherit"}, {
    requestMeta:()=>({"x-codex-turn-metadata":{session_id:"late-browser-test",turn_id:"inventory"}}),
  });
  t.after(()=>client.close());
  let call=0;
  async function inventory(){
    const result=await client.callTool({id:`inventory-${++call}`,name:"js",arguments:{code:'{ const state = await cua.getState({emit:false}); nodeRepl.write(JSON.stringify({browserCount:state.browsers.length,appCount:state.apps.length,errors:state.errors ?? []})); }'}});
    assert.notEqual(result.isError,true,JSON.stringify(result));
    const value=result.content.flatMap(item=>{if(item.type!=="text")return [];try{return [JSON.parse(item.text)];}catch{return [];}}).find(item=>typeof item.browserCount==="number");
    assert(value,JSON.stringify(result));return value;
  }
  const initial=await inventory();assert.equal(initial.browserCount,0);assert(initial.appCount>0);assert.deepEqual(initial.errors,[]);
  const input=new PassThrough(),output=new PassThrough(),decoder=new NativePipeFrameDecoder();
  let receive:(value:any)=>void=()=>{};
  new ExtensionBrowserPeer({setMessageCallback(callback){receive=callback;},sendMessage(message){input.write(encodeNativePipeFrame(JSON.stringify(message)));}}, {
    moveMouse(){},getInfo(){return {type:"extension",family:"chrome",name:"Late registered browser fixture",capabilities:{browser:[],tab:[]}};},getUserTabs(){return [];},getTabs(){return [];},turnEnded(){return {};},
  });
  output.on("data",bytes=>{for(const frame of decoder.push(bytes))receive(JSON.parse(frame));});
  let host!:Awaited<ReturnType<typeof startRustNativeHost>>;
  const tools=new BrowserStartupTools(client,{directory,prepare:async configured=>{
    assert.equal(configured,directory);
    host=await startRustNativeHost(input,output,{parentDirectory:configured});t.after(()=>host.close());
  }});
  assert((await tools.listTools()).some(tool=>tool.name==="prepare_browser"));
  const prepared=await tools.callTool({id:"prepare",name:"prepare_browser",arguments:{browser:"chrome"}});
  assert.notEqual(prepared.isError,true,JSON.stringify(prepared));
  const connected=await inventory();assert.equal(connected.browserCount,1);assert(connected.appCount>0);assert.deepEqual(connected.errors,[]);
  await host.close();
  const disconnected=await inventory();assert.equal(disconnected.browserCount,0);assert(disconnected.appCount>0);assert.deepEqual(disconnected.errors,[]);
});

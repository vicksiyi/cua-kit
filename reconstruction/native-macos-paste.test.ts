import test from "node:test";
import assert from "node:assert/strict";
import { createNativeMacClient, type NativeTransport } from "../packages/native-macos/src/client";
import { preparePasteContent, plainTextFromHtml } from "../packages/native-macos/src/paste-content";
import { bind_mac_app } from "../packages/cua/src/tinysky_alt/bind_mac_app";
import { createSkyService } from "../packages/sky/src/create_service";
function fixture(options: {denied?:boolean;fail?:boolean;restored?:boolean;warning?:boolean}={}) {
 const calls:Array<[string,any]>=[];
 const app={pid:1,name:"Fixture",bundleId:"test.fixture",path:"/Fixture.app",launchTime:1};
 const helper:NativeTransport={request:async <T>(method:string,params?:Record<string,unknown>)=>{
  calls.push([method,params]);
  if(method==="listApps")return {apps:[app]} as T;
  if(method==="bind")return {targetId:"bound",app} as T;
  if(method==="hello")return {permissions:{screenRecording:false}} as T;
  if(method==="observe")return {text:'[1] AXTextField "Name"\nScreenshot unavailable: Screen Recording permission is not granted.',snapshotId:"snap",elements:[],warnings:options.warning?["truncated"]:[]} as T;
  if(method==="pasteWithClipboard"){
   if(options.fail) throw Error("paste failed after dispatch");
   return {outcome:"observed",clipboardRestored:options.restored??true} as T;
  }
  throw Error(`Unexpected helper call ${method}`);
 }};
 return {calls,client:createNativeMacClient(helper,async ({effect})=>{if(options.denied&&effect==="write")throw Error("denied");})};
}
test("paste format conversion reuses third-party Markdown/HTML processors",()=>{
 assert.deepEqual(preparePasteContent("你好 🌍","text"),{text:"你好 🌍"});
 const md=preparePasteContent("**bold**","md");
 assert.equal(md.text,"**bold**");assert.match(md.html!,/<strong>bold<\/strong>/);
 const html=preparePasteContent('<b>A&amp;B</b><script>danger()</script>',"html");
 assert.deepEqual(html,{text:"A&B",html:"<b>A&amp;B</b>"});
 assert.equal(plainTextFromHtml(html.html!),"A&B");
 assert.throws(()=>preparePasteContent("x","unknown" as any),/Unsupported/);
});
test("restored app.paste routes each format through the atomic native transaction",async()=>{
 for(const format of ["text","md","html"] as const){
  const {client,calls}=fixture();
  const service=createSkyService(()=>client);
  const setup=await service.handleRpc({type:"setup"}) as {methods:string[]};
  assert.ok(setup.methods.includes("paste"));
  const computer=Object.fromEntries(setup.methods.map(method=>[method,(...args:unknown[])=>service.handleRpc({type:"execute",method,args})]));
  const app=bind_mac_app(computer as any,"Fixture");
  await app.getAXState({emit:false});
  assert.equal(await app.paste("hello",{format}),undefined);
  const content=preparePasteContent("hello",format);
  assert.deepEqual(calls.find(([method])=>method==="pasteWithClipboard")?.[1],{targetId:"bound",snapshotId:"snap",...content,richText:content.html===undefined?undefined:plainTextFromHtml(content.html)});
  assert.equal(calls.some(([method])=>method==="clipboardBegin"||method==="clipboardRestore"),false);
  await assert.rejects(app.paste("again"),/Observe/);
 }
});
test("paste requires authorization and a complete current observation",async()=>{
 for(const options of [{denied:true},{warning:true}]){
  const {client,calls}=fixture(options);await client.get_app_state({app:"Fixture"});
  await assert.rejects(client.paste({app:"Fixture",text:"x",format:"text"}),/denied|Observe/);
  assert.equal(calls.some(([method])=>method==="pasteWithClipboard"),false);
 }
});
test("paste failure and incomplete restoration invalidate the old snapshot",async()=>{
 for(const options of [{fail:true},{restored:false}]){
  const {client,calls}=fixture(options);await client.get_app_state({app:"Fixture"});
  await assert.rejects(client.paste({app:"Fixture",text:"x",format:"text"}),/failed|restoration/);
  await assert.rejects(client.paste({app:"Fixture",text:"x",format:"text"}),/Observe/);
  assert.equal(calls.filter(([method])=>method==="pasteWithClipboard").length,1);
 }
});

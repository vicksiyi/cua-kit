import test from "node:test";
import assert from "node:assert/strict";
import { screenshotDataUrl } from "../packages/native-macos/src/screenshot";
import { createNativeMacClient, type NativeTransport } from "../packages/native-macos/src/client";
import { bind_mac_app } from "../packages/cua/src/tinysky_alt/bind_mac_app";
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jDasAAAAASUVORK5CYII=";
const envelope = {mimeType:"image/png",coordinateSpace:"window-image-pixels",data:png,pixelWidth:1,pixelHeight:1};
test("screenshot envelope validates canonical bytes and dimensions",()=>{
 assert.equal(screenshotDataUrl(envelope),`data:image/png;base64,${png}`);
 for(const bad of [null,{}, {...envelope,pixelWidth:2},{...envelope,data:png+"?"},{...envelope,data:"YQ=="},{...envelope,coordinateSpace:"global"}]) assert.throws(()=>screenshotDataUrl(bad),/Malformed/);
});
function fixture(mode: "image"|"denied"|"malformed"|"failure") {
 const calls: string[]=[];
 const app={pid:1,name:"Fixture",bundleId:"test.fixture",path:"/Fixture.app",launchTime:1};
 const helper: NativeTransport={request:async <T>(method:string)=>{
  calls.push(method);
  if(method==="listApps") return {apps:[app]} as T;
  if(method==="bind") return {targetId:"bound",app} as T;
  if(method==="hello") return {permissions:{screenRecording:mode!=="denied"}} as T;
  if(method==="observeWithScreenshot" && mode==="failure") throw Error("Window moved during capture");
  if(method==="observe" || method==="observeWithScreenshot") return {snapshotId:"snap",elements:[{id:1,role:"AXTextField",name:"text"}],warnings:[],...(mode!=="denied"?{screenshot:mode==="malformed"?{}:envelope}:{})} as T;
  return {} as T;
 }};
 return {calls,client:createNativeMacClient(helper,async()=>{})};
}
test("restored getScreenshot decodes independent capture into original PNG bytes",async()=>{
 const {client,calls}=fixture("image");
 const app=bind_mac_app(client as any,"Fixture");
 assert.deepEqual(await app.getScreenshot({emit:false}),new Uint8Array(Buffer.from(png,"base64")));
 assert.ok(calls.includes("observeWithScreenshot"));
 assert.equal(calls.includes("observe"),false);
});
test("denied capture preserves AX-only state with explicit missing screenshot",async()=>{
 const {client,calls}=fixture("denied");
 const state=await client.get_app_state({app:"Fixture"});
 assert.equal(state.screenshot,null);assert.match(state.text,/permission is not granted/);
 assert.equal(calls.includes("observeWithScreenshot"),false);
 await assert.rejects(bind_mac_app(client as any,"Fixture").getScreenshot({emit:false}),/Screenshot unavailable/);
});
test("capture failure or malformed image cannot enable actions",async()=>{
 for(const mode of ["failure","malformed"] as const){
  const {client}=fixture(mode);
  await assert.rejects(client.get_app_state({app:"Fixture"}),/Window moved|Malformed/);
  await assert.rejects(client.set_value({app:"Fixture",element_index:1,value:"x"}),/Observe/);
 }
});
test("coordinate click can dispatch only after validated combined screenshot observation",async()=>{
 const {client,calls}=fixture("image");
 await client.get_app_state({app:"Fixture"});
 await client.click({app:"Fixture",x:0,y:0});
 assert.ok(calls.includes("mouseInput"));
 await assert.rejects(client.click({app:"Fixture",x:0,y:0}),/Observe/);
});

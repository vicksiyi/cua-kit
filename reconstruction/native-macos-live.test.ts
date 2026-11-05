/** Real owned-App acceptance gate. No mocks; opt-in never skips missing permissions. */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { NativeHelper } from "../packages/native-macos/src/helper";
import { createNativeMacClient, type NativeTransport } from "../packages/native-macos/src/client";
import { createSkyService } from "../packages/sky/src/create_service";
import { bind_mac_app } from "../packages/cua/src/tinysky_alt/bind_mac_app";
const enabled=process.env.CUA_NATIVE_LIVE_TEST==="1";
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
test("owned native App: actual capture, input, mouse, scroll, drag and paste",{skip:!enabled,timeout:180000},async()=>{
 assert.equal(process.platform,"darwin","Native acceptance requires macOS");
 const evidence:{status:string;passed:string[];permissions?:unknown;error?:string;at:string}={status:"running",passed:[],at:new Date().toISOString()};
 const {helper,hello}=await NativeHelper.connect(resolve("native/macos/.build/debug/cua-helper"));
 let child:ChildProcess|undefined;
 try {
  evidence.permissions=hello.permissions;
  assert.ok(hello.permissions.accessibility && hello.permissions.screenRecording,
   "Grant Accessibility and Screen Recording to the responsible terminal/agent host, then rerun. No UI operation was attempted.");
  const events:Array<Record<string,any>>=[];
  child=spawn(resolve("native/macos/.build/debug/CuaFixture"),["--acceptance"],{stdio:["ignore","pipe","pipe"]});
  child.stderr!.resume();
  const lines=createInterface({input:child.stdout!});
  let ready=false;
  lines.on("line",line=>{if(line==="READY")ready=true;else {try{events.push(JSON.parse(line));}catch{}}});
  let launchError:Error|undefined;child.on("error",error=>{launchError=error;});
  const waitFor=async(predicate:()=>boolean,label:string)=>{
   const until=Date.now()+5000;
   while(!predicate()){
    if(launchError)throw launchError;
    assert.equal(child!.exitCode,null,`Fixture exited during ${label}`);
    assert.ok(Date.now()<until,`Actual fixture effect not observed: ${label}`);await delay(25);
   }
  };
  await waitFor(()=>ready,"startup");
  const apps=(await helper.request<{apps:Array<{pid:number;path:string}>}>("listApps")).apps;
  const owned=apps.find(item=>item.pid===child!.pid);assert.ok(owned,"Owned fixture absent from native inventory");
  let last:any;
  const transport:NativeTransport={request:async <T>(method:string,params?:Record<string,unknown>)=>{
   const result=await helper.request<T>(method,params);
   if(method==="observeWithScreenshot")last=result;
   return result;
  }};
  const client=createNativeMacClient(transport,async ({app})=>{assert.equal(app.pid,child!.pid,"Acceptance must never authorize another application");});
  const service=createSkyService(()=>client);
  const setup=await service.handleRpc({type:"setup"}) as {methods:string[]};
  const computer=Object.fromEntries(setup.methods.map(method=>[method,(...args:unknown[])=>service.handleRpc({type:"execute",method,args})]));
  const app=bind_mac_app(computer as any,owned.path);
  const observe=async()=>{
   const state=await app.getAXStateAndScreenshot({emit:false});
   assert.ok(state.screenshot && state.screenshot.length>100,"Expected real screenshot bytes");
   assert.equal(Buffer.from(state.screenshot).subarray(0,8).toString("hex"),"89504e470d0a1a0a");
   return state.state;
  };
  const element=(name:string)=>{
   const matches=last.elements.filter((e:any)=>e.name===name);
   assert.equal(matches.length,1,`Expected unique fixture AX element: ${name}`);return matches[0];
  };
  const pixelPoint=(node:any,fx=0.5,fy=0.5):[number,number]=>{
   // Independent AX window frame + returned PNG dimensions. Do not invert the
   // helper's contentRect transform: an incorrect mapping must fail real hit tests.
   const windows=last.elements.filter((e:any)=>e.role==="AXWindow");assert.equal(windows.length,1);
   const window=windows[0].frame,frame=node.frame;assert.ok(window&&frame);
   return [(frame.x+frame.width*fx-window.x)*last.screenshot.pixelWidth/window.width,
           (frame.y+frame.height*fy-window.y)*last.screenshot.pixelHeight/window.height];
  };
  const waitText=async(expected:string)=>{
   for(let attempt=0;attempt<10;attempt++){const text=await observe();if(text.includes(expected))return;await delay(50);}
   assert.fail(`App AX state did not show expected fixture text: ${expected}`);
  };
  await observe();evidence.passed.push("screenshot-and-AX");
  await app.setValue(element("Fixture name").id,"Alice");await waitText("Alice");
  await app.click(element("Save fixture").id);await waitText("Saved Alice");evidence.passed.push("set-value-and-indexed-click");
  await app.performSecondaryAction(element("Fixture name").id,"focus");await observe();
  await app.selectText(element("Fixture name").id,"Alice");await observe();
  await app.typeText("你好 🌍");await waitText("你好 🌍");evidence.passed.push("focus-selection-unicode-input");
  await app.pressKey("super+a");await observe();
  await app.paste("Native paste 中文 🌍");await waitText("Native paste 中文 🌍");evidence.passed.push("key-chord-text-paste-and-restoration");
  await app.click(pixelPoint(element("Save fixture")));await waitText("Saved Native paste 中文 🌍");evidence.passed.push("screenshot-coordinate-click");
  const beforeScroll=events.filter(event=>event.event==="scroll").at(-1)?.offsetY??0;
  await app.scroll(element("Fixture scroll area").id,"down",0.5);
  await waitFor(()=>events.some(event=>event.event==="scroll"&&event.offsetY>beforeScroll),"actual NSScrollView offset");evidence.passed.push("scroll-view-moved");
  await observe();const pad=element("Fixture input pad");const from=pixelPoint(pad,0.2),to=pixelPoint(pad,0.8);
  const beforeDrag=events.length;
  await app.drag(from,to);
  await waitFor(()=>events.slice(beforeDrag).some(event=>event.event==="pad-up"&&event.moves>0),"drag move and mouse-up received by fixture");
  evidence.passed.push("drag-events-received");evidence.status="passed";
 } catch(error){evidence.status=hello.permissions.accessibility&&hello.permissions.screenRecording?"failed":"blocked";evidence.error=error instanceof Error?error.message:String(error);throw error;}
 finally {
  if(child?.pid && child.exitCode===null && child.signalCode===null){
   const closed=once(child,"close");const ownedChild=child;
   const timer=setTimeout(()=>ownedChild.kill("SIGKILL"),2000);
   child.kill();try{await closed;}finally{clearTimeout(timer);}
  }
  await helper.close();
  const path=process.env.CUA_NATIVE_EVIDENCE_PATH??"/tmp/cua-native-live-evidence.json";
  await writeFile(path,JSON.stringify(evidence,null,2)+"\n",{mode:0o600});
  console.log(`Native acceptance evidence: ${path}; ${evidence.status}; passed=${evidence.passed.join(",")||"none"}`);
 }
});

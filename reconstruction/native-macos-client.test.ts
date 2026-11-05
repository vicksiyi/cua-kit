import test from "node:test";
import assert from "node:assert/strict";
import { createNativeMacClient, type NativeTransport } from "../packages/native-macos/src/client";
function fixture(options: { deny?: boolean; changeIdentity?: boolean; observeFailure?: boolean } = {}) {
 const calls: Array<[string,any]> = [];
 const app={pid:42,name:"Fixture",bundleId:"test.fixture",path:"/Fixture.app",launchTime:1};
 let reads=0;
 const helper: NativeTransport = {request: async <T>(method:string,params?:Record<string,unknown>) => {
  calls.push([method,params]);
  if(method==="hello") return {permissions:{screenRecording:false}} as T;
  if(method==="listApps") return {apps:[app]} as T;
  if(method==="bind") return {targetId:"target",app:{...app,launchTime:options.changeIdentity?2:1}} as T;
  if(method==="observe") {if(options.observeFailure && ++reads>1) throw Error("read failed"); return {snapshotId:"snapshot",elements:[{id:1,role:"AXTextField",name:"Name"}],warnings:[]} as T;}
  return {} as T;
 }};
 const client=createNativeMacClient(helper,async request=>{calls.push(["authorize",request]);if(options.deny)throw Error("denied");});
 return {calls,client};
}
test("app inventory maps identifiers without requiring App access",async()=>{
 const {client,calls}=fixture({deny:true});
 assert.deepEqual(await client.list_apps(),[{id:"test.fixture",displayName:"Fixture",isRunning:true}]);
 assert.deepEqual(calls.map(c=>c[0]),["listApps"]);
});
test("authorization denial and identity changes prevent observations",async()=>{
 for(const options of [{deny:true},{changeIdentity:true}]){
  const {client,calls}=fixture(options);
  await assert.rejects(client.get_app_state({app:"Fixture"}),/denied|identity changed/);
  assert.equal(calls.some(c=>c[0]==="observe"),false);
 }
});
test("observed element input is serialized, authorized and invalidates snapshot",async()=>{
 const {client,calls}=fixture();
 await assert.rejects(client.set_value({app:"Fixture",element_index:1,value:"x"}),/Observe/);
 const state=await client.get_app_state({app:"Fixture"});
 assert.equal(state.screenshot,null); assert.match(state.text,/AXTextField/);
 await client.set_value({app:"Fixture",element_index:1,value:"new"});
 assert.deepEqual(calls.find(c=>c[0]==="action")?.[1],{targetId:"target",snapshotId:"snapshot",operation:"setValue",elementId:1,value:"new"});
 await assert.rejects(client.type_text({app:"Fixture",text:"x"}),/Observe/);
 assert.equal(calls.some(c=>c[0]==="keyboardInput"),false);
});
test("failed observation cannot leave prior snapshot actionable",async()=>{
 const {client}=fixture({observeFailure:true});
 await client.get_app_state({app:"Fixture"});
 await assert.rejects(client.get_app_state({app:"Fixture"}),/read failed/);
 await assert.rejects(client.set_value({app:"Fixture",element_index:1,value:"x"}),/Observe/);
 await assert.rejects(client.press_key({app:"Fixture",key:"a",duration:31}),/0..30/);
});
test("selection modes preserve Sky options and consume observation once",async()=>{
 for(const selection_type of ["text","cursor_before","cursor_after"] as const){
  const {client,calls}=fixture();
  await client.get_app_state({app:"Fixture"});
  assert.equal(await client.select_text({app:"Fixture",element_index:1,text:"🌍你好",prefix:"A",suffix:"B",selection_type}),undefined);
  assert.deepEqual(calls.find(c=>c[0]==="action")?.[1],{targetId:"target",snapshotId:"snapshot",operation:"selectText",elementId:1,value:"🌍你好",options:{prefix:"A",suffix:"B",selectionType:selection_type}});
  await assert.rejects(client.select_text({app:"Fixture",element_index:1,text:"x"}),/Observe/);
 }
});
test("secondary actions use indexed snapshot and cannot bypass approval",async()=>{
 const {client,calls}=fixture();
 await client.get_app_state({app:"Fixture"});
 assert.equal(await client.perform_secondary_action({app:"Fixture",element_index:1,action:"AXShowMenu"}),undefined);
 assert.equal(calls.find(c=>c[0]==="action")?.[1].value,"AXShowMenu");
 const denied=fixture({deny:true});
 await assert.rejects(denied.client.perform_secondary_action({app:"Fixture",element_index:1,action:"focus"}),/denied/);
 assert.equal(denied.calls.some(c=>c[0]==="action"),false);
});
test("restored CUA app methods reach independent selection and secondary action",async()=>{
 const {bind_mac_app}=await import("../packages/cua/src/tinysky_alt/bind_mac_app");
 const {createSkyService}=await import("../packages/sky/src/create_service");
 const {client,calls}=fixture();
 const service=createSkyService(()=>client);
 const setup=await service.handleRpc({type:"setup"}) as {methods:string[]};
 assert.ok(setup.methods.includes("select_text"));
 assert.ok(setup.methods.includes("perform_secondary_action"));
 const computer=Object.fromEntries(setup.methods.map(method=>[method,(...args:unknown[])=>service.handleRpc({type:"execute",method,args})]));
 const app=bind_mac_app(computer as any,"Fixture");
 await app.getAXState({emit:false});
 await app.selectText(1,"Name",{selectionType:"cursor_after"});
 await app.getAXState({emit:false});
 await app.performSecondaryAction(1,"focus");
 assert.deepEqual(calls.filter(c=>c[0]==="action").map(c=>[c[1].operation,c[1].options?.selectionType,c[1].value]),[["selectText","cursor_after","Name"],["secondary",undefined,"focus"]]);
});
test("indexed clicks use native mouse events and require fresh observations",async()=>{
 const {bind_mac_app}=await import("../packages/cua/src/tinysky_alt/bind_mac_app");
 const {client,calls}=fixture();
 const app=bind_mac_app(client as any,"Fixture");
 await app.getAXState({emit:false});
 assert.equal(await app.click(1,{mouseButton:"right",clickCount:2,key:"Control+Shift"}),undefined);
 assert.deepEqual(calls.find(c=>c[0]==="mouseInput")?.[1],{targetId:"target",snapshotId:"snapshot",elementId:1,x:undefined,y:undefined,mouseButton:"right",clickCount:2,key:"Control+Shift",duration:undefined});
 assert.equal(calls.some(c=>c[0]==="action"),false);
 await assert.rejects(app.click(1),/Observe/);
});
test("click rejects missing screenshot, mixed targets, counts and invalid holds",async()=>{
 const {client,calls}=fixture();
 await client.get_app_state({app:"Fixture"});
 await assert.rejects(client.click({app:"Fixture",x:1,y:2}),/current screenshot/);
 await assert.rejects(client.click({app:"Fixture",x:1,y:2,element_index:1}),/either/);
 await assert.rejects(client.click({app:"Fixture",element_index:1,click_count:0}),/count/);
 await assert.rejects(client.click({app:"Fixture",element_index:1,duration:31}),/0..30/);
 assert.equal(calls.some(c=>c[0]==="mouseInput"),false);
});

test("restored AX state exposes hierarchy, available actions and state without secure values",async()=>{
 const elements = [
  {id:1,role:"AXWindow",name:"Editor"},
  {id:2,parentId:1,role:"AXTextField",name:"Name",value:"draft",frame:{x:-20,y:40,width:200,height:30},properties:{secure:false,actions:"AXShowMenu",AXEnabled:true,AXFocused:false,selectionStart:0,selectionLength:2}},
  {id:3,parentId:1,role:"AXSecureTextField",name:"Password",value:"must-not-leak",properties:{secure:true,actions:"",AXEnabled:true}},
 ];
 const helper:NativeTransport={request:async <T>(method:string)=>{
  if(method==="listApps") return {apps:[{pid:42,name:"Fixture",bundleId:"test.fixture",path:"/Fixture.app",launchTime:1}]} as T;
  if(method==="bind") return {targetId:"target",app:{pid:42,name:"Fixture",bundleId:"test.fixture",path:"/Fixture.app",launchTime:1}} as T;
  if(method==="hello") return {permissions:{screenRecording:false}} as T;
  if(method==="observe") return {snapshotId:"snapshot",elements,warnings:[]} as T;
  throw Error(`Unexpected method ${method}`);
 }};
 const {bind_mac_app}=await import("../packages/cua/src/tinysky_alt/bind_mac_app");
 const app=bind_mac_app(createNativeMacClient(helper,async()=>{}) as any,"Fixture");
 const state=await app.getAXState({emit:false});
 const text=typeof state === "string" ? state : JSON.stringify(state);
 assert.match(text,/parent=\[1\]/);
 assert.ok(text.includes("AXShowMenu"));
 assert.ok(text.includes("AXFocused"));
 assert.ok(text.includes("selectionLength"));
 assert.ok(text.includes("-20"));
 assert.ok(text.includes("draft"));
 assert.ok(!text.includes("must-not-leak"));
});

test("restored app scroll exposes the service method and preserves direction/page target",async()=>{
 const {bind_mac_app}=await import("../packages/cua/src/tinysky_alt/bind_mac_app");
 const {createSkyService}=await import("../packages/sky/src/create_service");
 const {client,calls}=fixture();
 const service=createSkyService(()=>client);
 const setup=await service.handleRpc({type:"setup"}) as {methods:string[]};
 assert.ok(setup.methods.includes("scroll"));
 const computer=Object.fromEntries(setup.methods.map(method=>[method,(...args:unknown[])=>service.handleRpc({type:"execute",method,args})]));
 const app=bind_mac_app(computer as any,"Fixture");
 await app.getAXState({emit:false});
 assert.equal(await app.scroll(1,"down",0.5),undefined);
 assert.deepEqual(calls.find(c=>c[0]==="scrollInput")?.[1],{targetId:"target",snapshotId:"snapshot",elementId:1,x:undefined,y:undefined,direction:"down",pages:0.5});
 await assert.rejects(app.scroll(1,"down"),/Observe/);
});
test("scroll rejects unobserved coordinates and malformed targets or pages before dispatch",async()=>{
 const {client,calls}=fixture();
 await client.get_app_state({app:"Fixture"});
 await assert.rejects(client.scroll({app:"Fixture",x:1,y:2,direction:"down"}),/current screenshot/);
 for(const input of [
  {element_index:1,x:1,y:2,direction:"down"},
  {element_index:1,direction:"invalid"},
  ...[0,-1,NaN,Infinity].map(pages=>({element_index:1,direction:"down",pages})),
 ]) await assert.rejects(client.scroll({app:"Fixture",...input}),/either|direction|pages/);
 assert.equal(calls.some(c=>c[0]==="scrollInput"),false);
});

test("restored CUA durationMs maps to native key and mouse holds with void results",async()=>{
 const {bind_mac_app}=await import("../packages/cua/src/tinysky_alt/bind_mac_app");
 const {client,calls}=fixture();const app=bind_mac_app(client as any,"Fixture");
 await app.getAXState({emit:false});
 assert.equal(await app.pressKey("a",{durationMs:30000}),undefined);
 assert.deepEqual(calls.find(c=>c[0]==="keyboardInput")?.[1],{targetId:"target",snapshotId:"snapshot",operation:"pressKey",key:"a",durationMs:30000});
 await app.getAXState({emit:false});
 assert.equal(await app.click(1,{durationMs:125,clickCount:2}),undefined);
 assert.equal(calls.find(c=>c[0]==="mouseInput")?.[1].duration,0.125);
 await app.getAXState({emit:false});assert.equal(await app.setValue(1,"x"),undefined);
 await app.getAXState({emit:false});assert.equal(await app.typeText("x"),undefined);
});
test("held input rejects invalid duration before native dispatch",async()=>{
 const {client,calls}=fixture();await client.get_app_state({app:"Fixture"});
 for(const duration of [-1,30.001,NaN,Infinity]){
  await assert.rejects(client.press_key({app:"Fixture",key:"a",duration}),/0..30/);
  await assert.rejects(client.click({app:"Fixture",element_index:1,duration}),/0..30/);
 }
 assert.equal(calls.some(([method])=>method==="keyboardInput"||method==="mouseInput"),false);
});
test("native helper timeout covers legal hold duration and repetition",async()=>{
 const {nativeRequestTimeout}=await import("../packages/native-macos/src/helper");
 assert.equal(nativeRequestTimeout("keyboardInput",{operation:"pressKey",durationMs:30000}),45000);
 assert.equal(nativeRequestTimeout("mouseInput",{duration:30,clickCount:10}),315000);
 assert.equal(nativeRequestTimeout("mouseInput",{duration:0.125,clickCount:2}),15250);
 assert.equal(nativeRequestTimeout("observe",{}),15000);
 assert.equal(nativeRequestTimeout("mouseInput",{duration:Infinity}),15000);
 assert.equal(nativeRequestTimeout("mouseInput",{duration:30,clickCount:100000}),15000);
});

test("unrunning app resolves and authorizes launch before binding; denial prevents launch",async()=>{
 for(const deny of [true,false]){
  const calls:string[]=[];
  const installed={pid:0,name:"Fixture",bundleId:"test.fixture",path:"/Fixture.app",launchTime:0};
  const running={...installed,pid:43,launchTime:2};
  const helper:NativeTransport={request:async<T>(method:string,params?:Record<string,unknown>)=>{
   calls.push(method);
   if(method==="listApps")return {apps:[]} as T;
   if(method==="resolveApp")return {app:installed} as T;
   if(method==="launchApp"){assert.deepEqual(params,{path:installed.path,bundleId:installed.bundleId});return {app:running} as T;}
   if(method==="bind")return {targetId:"launched",app:running} as T;
   if(method==="hello")return {permissions:{screenRecording:false}} as T;
   if(method==="observe")return {snapshotId:"s",elements:[],warnings:[]} as T;
   throw Error(method);
  }};
  const client=createNativeMacClient(helper,async ({operation,effect})=>{
   calls.push(`authorize:${operation}`);
   if(operation==="launchApp"){assert.equal(effect,"write");if(deny)throw Error("launch denied");}
  });
  if(deny){await assert.rejects(client.get_app_state({app:"Fixture"}),/launch denied/);assert.equal(calls.includes("launchApp"),false);}
  else{await client.get_app_state({app:"Fixture"});assert.deepEqual(calls.slice(0,6),["listApps","resolveApp","authorize:launchApp","launchApp","authorize:get_app_state","bind"]);}
 }
});

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
 await assert.rejects(client.press_key({app:"Fixture",key:"a",duration:1}),/not yet implemented/);
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

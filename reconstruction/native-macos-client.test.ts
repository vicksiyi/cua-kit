import test from "node:test";
import assert from "node:assert/strict";
import { createNativeMacClient, type NativeTransport } from "../packages/native-macos/src/client";
function fixture(options: { deny?: boolean; changeIdentity?: boolean; observeFailure?: boolean } = {}) {
 const calls: Array<[string,any]> = [];
 const app={pid:42,name:"Fixture",bundleId:"test.fixture",path:"/Fixture.app",launchTime:1};
 let reads=0;
 const helper: NativeTransport = {request: async <T>(method:string,params?:Record<string,unknown>) => {
  calls.push([method,params]);
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

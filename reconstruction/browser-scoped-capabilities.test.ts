import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings, serviceSourceSha256, serviceClassMethod, serviceClassWithMethods } from "./service-source";
import { createBrowserFeatureClients } from "../packages/browser/src/service/runtime/browser_feature_clients";
import { effectiveBrowserCapabilities } from "../packages/browser/src/service/effective_capabilities";
import { disabledCapabilities, filterCapabilities } from "../packages/browser/src/service/capability_filter";
import { createBrowserContextClass } from "../packages/browser/src/service/context/browser_context";
import { getBrowserDocumentation } from "../packages/browser/src/service/commands/browser_inventory";
assert.equal(serviceSourceSha256,"396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021");
async function lifecycle(original: boolean, failure: string) {
  const trace: any[] = [];
  const parent = {initialized:false,user:{userID:"one",email:"fixture@example.test",custom:{preserved:"value"}}};
  let blocked=false;
  const runtime={env:{}};
  const info={type:"extension",family:"chrome"};
  const createClient=(_runtime:any,user:any)=>{
    trace.push(["client",user]);
    return {loadingStatus:"Ready",initializeAsync:async(options:any)=>{
      trace.push(["initialize",options]);
      if(failure==="throw")throw Error("fixture initialization failure");
      return {success:failure!=="false"};
    },checkGate:(name:string)=>{trace.push(["gate",name]);return true;},shutdown:async()=>{trace.push(["shutdown"]);}};
  };
  const reportError=(error:any)=>trace.push(["error",error.message]);
  const deps={parent:()=>parent,disabled:()=>blocked,createClient,reportError};
  const old=original?originalServiceBindings(["JB","XB","YB"],{kr:parent,cc:new Map(),qt:()=>blocked,VB:createClient,dc:10000,dt:reportError}):undefined;
  const api=old?{initialize:old.XB,enabled:old.YB}:createBrowserFeatureClients(deps);
  const values=[];
  await api.initialize(runtime,info); values.push(api.enabled(runtime,"test",info));
  parent.initialized=true;
  await Promise.all([api.initialize(runtime,info),api.initialize(runtime,info)]);
  values.push(api.enabled(runtime,"test",info));
  values.push(api.enabled(runtime,"test",{...info,family:"edge"}));
  blocked=true;await api.initialize(runtime,info);values.push(api.enabled(runtime,"test",info));blocked=false;
  parent.user={...parent.user,userID:"two"};
  values.push(api.enabled(runtime,"test",info));await api.initialize(runtime,info);
  values.push(api.enabled(runtime,"test",info));
  await Promise.resolve();return {trace,values};
}
test("browser-scoped feature clients match installed identity isolation, deduplication and failure cleanup",async()=>{
 for(const failure of ["none","false","throw"]) assert.deepEqual(await lifecycle(false,failure),await lifecycle(true,failure));
});
test("effective capability filtering matches current source without mutating provider inventory",()=>{
 for(const enabled of [true,false])for(const disabled of ["","siwc","capture,siwc","capture"]){
  const runtime={env:{BROWSER_USE_DISABLE_TAB_CAPABILITIES:disabled}};
  const info={type:"extension",capabilities:{browser:[{id:"history"}],tab:[{id:"siwc"},{id:"capture"}]}};
  const calls:any[]=[];const gate=(...args:any[])=>{calls.push(args);return enabled;};
  const old=originalServiceBindings(["Ea"],{Of:disabledCapabilities,oD:filterCapabilities,YB:gate}).Ea;
  const before=structuredClone(info);
  const expected=old(runtime,info);const oldCalls=calls.splice(0);
  assert.deepEqual(effectiveBrowserCapabilities(runtime,info,gate),expected);
  assert.deepEqual(calls,oldCalls);assert.deepEqual(info,before);
 }
});
test("context capability checks apply disabled lists and fail closed when getInfo rejects",async()=>{
 const cls=serviceClassWithMethods(["supportsTabCapability","issueSiwcBrowserGrant"]);
 const old=new Function("Ea","return {"+serviceClassMethod(cls,"supportsTabCapability")+"}")(effectiveBrowserCapabilities);
 const restored=createBrowserContextClass({} as any).prototype;
 for(const proto of [old,restored]){
  const context=Object.assign(Object.create(proto),{runtime:{env:{BROWSER_USE_DISABLE_TAB_CAPABILITIES:"capture"}},api:{getInfo:async()=>({capabilities:{tab:[{id:"capture"},{id:"history"},{id:"siwc"}]}})}});
  assert.equal(await context.supportsTabCapability("capture"),false);
  assert.equal(await context.supportsTabCapability("history"),true);
  assert.equal(await context.supportsTabCapability("siwc"),false);
  context.api.getInfo=async()=>{throw Error("offline");};
  assert.equal(await context.supportsTabCapability("history"),false);
 }
});
test("browser documentation receives resolved filtered details after async capability preparation",async()=>{
 let observed:any;
 await getBrowserDocumentation({browser_id:"1"},{get:async()=>({id:"1",info:{type:"extension",capabilities:{tab:[{id:"capture"}]}}})} as any,
  {env:{BROWSER_USE_DISABLE_TAB_CAPABILITIES:"capture"}},{readBrowser:(info:any)=>{observed=info;},read:()=>{}});
 assert.equal(typeof observed?.then,"undefined");assert.deepEqual(observed.capabilities.tab,[]);
});

test("telemetry assembly warms browser clients only after caller identity is ready",async()=>{
 const {createBrowserTelemetry}=await import("../packages/browser/src/service/runtime/browser_telemetry");
 const clients:any[]=[];
 class Client {
  loadingStatus="Ready";
  constructor(_key:any,public user:any,public options:any){clients.push(this);}
  async initializeAsync(){return {success:true};}
  async updateUserAsync(user:any){this.user=user;return {success:true};}
  checkGate(){return true;}
  async shutdown(){}
 }
 const telemetry=createBrowserTelemetry(Client as any);
 const runtime:any={env:{},platform:"darwin",fetch:async()=>({ok:true,json:async()=>({object:"user",id:"fixture-caller"})})};
 const info={type:"extension",family:"chrome"};
 await telemetry.prepareBrowserFeatures(runtime,info);
 assert.equal(clients.length,0);
 await telemetry.configureRuntimeTelemetry(runtime,{setTag(){},setUser(){}});
 await telemetry.prepareBrowserFeatures(runtime,info);
 assert.equal(clients.length,2);
 assert.equal(telemetry.browserFeatureEnabled(runtime,"browser_use_siwc_enabled",info),true);
 assert.equal(telemetry.browserFeatureEnabled(runtime,"browser_use_siwc_enabled",{...info,family:"edge"}),false);
 assert.equal(clients[1].user.userID,"fixture-caller");
 assert.equal(clients[1].user.custom.browserFamily,"chrome");
 assert.equal(clients[1].options.networkConfig.networkOverrideFunc instanceof Function,true);
});

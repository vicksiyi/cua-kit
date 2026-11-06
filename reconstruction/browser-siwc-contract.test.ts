import test from "node:test";
import assert from "node:assert/strict";
import {z} from "../packages/browser/src/vendor/bundled_zod";
import {originalServiceBindings,serviceSourceSha256} from "./service-source";
import {SiwcAuthenticate,SiwcDetect} from "../packages/browser/src/commands/siwc";
import {SiwcTabCapability} from "../packages/browser/src/capabilities/tab_siwc";
assert.equal(serviceSourceSha256,"396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021");
const old=originalServiceBindings(["Iy","Bs","yi","Ry","RC","g$","kC","y$"],{p:z});
const parsed=(schema:any,input:any)=>{const r=schema.safeParse(input);return r.success?{data:r.data}:{issues:r.error.issues};};
test("SIWC payload and result schemas preserve installed discriminators, counts and validation",()=>{
 const target={kind:"dom",snapshotId:"snapshot",ref:"node"};
 const candidate={evidence:"siwc_marker_detected",visibility:"rendered",target};
 for(const [local,source,values] of [
  [SiwcAuthenticate.PayloadSchema,old.RC,[{browser_id:"1",tab_id:"2"},{browser_id:"1",tab_id:"2",target},{browser_id:"1",tab_id:"2",target:{kind:"ax",snapshotId:"s",elementIndex:0}},{browser_id:"1",tab_id:"2",target:{kind:"ax",snapshotId:"",elementIndex:-1}},{browser_id:1,tab_id:2}]],
  [SiwcDetect.PayloadSchema,old.kC,[{browser_id:"1",tab_id:"2",extra:true},{},null]],
  [SiwcDetect.ResultSchema,old.y$,[{status:"possible_matches",candidates:[candidate]},{status:"possible_matches",candidates:[]},{status:"no_deterministic_matches",candidates:[]},{status:"unavailable",reason:"page_changed"},{status:"unavailable",reason:"unknown"}]],
  [SiwcAuthenticate.ResultSchema,old.g$,[{status:"initiated"},{status:"approval_cancelled"},{status:"multiple_actionable_buttons",candidates:[candidate]},{status:"multiple_actionable_buttons",candidates:[candidate,candidate,candidate]},{status:"unexpected"}]],
 ] as any[])for(const value of values)assert.deepEqual(parsed(local,value),parsed(source,value));
});
test("SIWC client validates authentication before dispatch and overrides caller tab identity",async()=>{
 const calls:any[]=[];const result={status:"fixture-result"};
 const client=new SiwcTabCapability({browserId:"owned-browser",tabId:"owned-tab",info:{id:"siwc",description:"fixture"},documentation:{get:async()=>"docs"},transport:{send:async({command}:any)=>{calls.push(command.toJSON());return result;}}} as any);
 assert.equal(await client.detect(),result);
 assert.equal(await client.authenticate(),result);
 assert.equal(await client.authenticate({browser_id:"spoofed",tab_id:"spoofed",target:{kind:"dom",snapshotId:"s",ref:"node"}} as any),result);
 assert.deepEqual(calls.map(c=>[c.type,c.browser_id,c.tab_id]),[["tab_siwc_detect","owned-browser","owned-tab"],["tab_siwc_authenticate","owned-browser","owned-tab"],["tab_siwc_authenticate","owned-browser","owned-tab"]]);
 await assert.rejects(client.authenticate({target:{kind:"dom",snapshotId:"",ref:""}}));
 assert.equal(calls.length,3);
});

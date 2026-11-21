import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readNativePermissions, parseNativePermissions, nativePermissionsContext, nativeAppPolicyContext, standaloneAppPolicyDenialHint } from "../packages/agent-loop/src/native-permissions";

test("local policy guidance explains wildcard precedence and separates policy from consent",()=>{
  assert.match(nativeAppPolicyContext({}),/Unlisted apps are denied by default/);
  const context=nativeAppPolicyContext({'*':{decision:'allowed'},'com.core.denied':{decision:'denied'}});
  assert.match(context,/wildcard default \(allowed\)/);
  assert.match(context,/exact per-app rules take priority/);
  assert.match(context,/only enables requesting user approval/);
  assert.doesNotMatch(context,/Unlisted apps are denied by default/);
  assert.match(standaloneAppPolicyDenialHint("Computer Use is blocked from using the app 'com.openai.codex' by your organization's policy.")!,/精确规则及 \* 默认规则/);
});

test("permission evidence requires exact booleans and a nonprompting probe",()=>{
  for(const value of [null,{},[],{accessibility:true,screenRecording:true},{accessibility:"false",screenRecording:true,requested:false},{accessibility:true,screenRecording:true,requested:true}])
    assert.throws(()=>parseNativePermissions(JSON.stringify(value)));
  assert.deepEqual(parseNativePermissions('{"accessibility":false,"screenRecording":true,"requested":false}'),{accessibility:false,screenRecording:true});
  assert.match(nativePermissionsContext({accessibility:false,screenRecording:true}),/unavailable/);
  assert.doesNotMatch(nativePermissionsContext({accessibility:true,screenRecording:true}),/is unavailable/);
});

test("nonzero probe status 2 is valid evidence, other failures cannot become missing permissions",async t=>{
  const root=await mkdtemp("/tmp/core-permission-probe-");t.after(()=>rm(root,{recursive:true,force:true}));
  const helper=join(root,"helper");
  async function write(code:number,text:string){
    await writeFile(helper,`#!${process.execPath}\nif(process.argv[2]!=="--permissions"||process.argv.length!==3)process.exit(99);\nprocess.stdout.write(${JSON.stringify(text)});process.exit(${code});\n`);await chmod(helper,0o700);
  }
  const valid=JSON.stringify({accessibility:false,screenRecording:false,requested:false});
  await write(2,valid);assert.deepEqual(await readNativePermissions(helper),{accessibility:false,screenRecording:false});
  await write(1,valid);await assert.rejects(readNativePermissions(helper));
  await write(0,"not-json");await assert.rejects(readNativePermissions(helper));
  await assert.rejects(readNativePermissions(join(root,"missing")));
});

test("actual Swift helper reports permission booleans without prompting",{skip:process.platform!=="darwin"},async()=>{
  const result=await readNativePermissions(resolve("native/macos/.build/debug/cua-helper"));
  assert.equal(typeof result.accessibility,"boolean");assert.equal(typeof result.screenRecording,"boolean");
});

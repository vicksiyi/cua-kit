/** Real LaunchServices test in an owned temporary .app, without AX permission. */
import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,copyFile,writeFile,rm} from "node:fs/promises";
import {join,resolve} from "node:path";
import {NativeHelper} from "../packages/native-macos/src/helper";
test("helper resolves and launches only the approved installed app identity",{skip:process.platform!=="darwin",timeout:30000},async()=>{
 const root=await mkdtemp("/tmp/core-launch-");
 const app=join(root,"CoreLaunchFixture.app");
 const contents=join(app,"Contents"),bin=join(contents,"MacOS");
 await mkdir(bin,{recursive:true});
 await copyFile(resolve("native/macos/.build/debug/CuaFixture"),join(bin,"CuaFixture"));
 const id=`dev.core.launchfixture.${Date.now()}`;
 await writeFile(join(contents,"Info.plist"),`<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>CuaFixture</string><key>CFBundleIdentifier</key><string>${id}</string><key>CFBundleName</key><string>CoreLaunchFixture</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
 const {helper}=await NativeHelper.connect(resolve("native/macos/.build/debug/cua-helper"));
 let pid:number|undefined;
 try{
  const resolved=await helper.request<{app:{path:string;bundleId:string;pid:number}}>("resolveApp",{reference:app});
  assert.equal(resolved.app.pid,0);assert.equal(resolved.app.bundleId,id);
  await assert.rejects(helper.request("launchApp",{path:resolved.app.path,bundleId:"wrong.identity"}),/identity changed/);
  const launched=await helper.request<{app:{path:string;bundleId:string;pid:number}}>("launchApp",{path:resolved.app.path,bundleId:id});
  pid=launched.app.pid;
  assert.ok(pid>0);assert.equal(launched.app.bundleId,id);assert.equal(launched.app.path,resolved.app.path);
  const bound=await helper.request<{app:{pid:number}}>("bind",{pid});assert.equal(bound.app.pid,pid);
 }finally{
  if(pid)try{process.kill(pid,"SIGTERM");}catch{}
  await helper.close();await rm(root,{recursive:true,force:true});
 }
});

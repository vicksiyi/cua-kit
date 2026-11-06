import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {ElicitRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {stageRuntimePackages} from '../packages/agent-loop/src/runtime-packages';
import {readRuntimeEnvironment} from '../packages/agent-loop/src/restored-runtime';
import {prepareIndependentRuntime} from '../packages/agent-loop/src/independent-runtime';

test('MCP runtime forwards policy source through Rust and Swift to owned app-server', {skip:process.platform!=='darwin'||process.env.CUA_TEST_NATIVE_SKY_IPC!=='1',timeout:30000},async t=>{
 const root=await realpath(await mkdtemp('/tmp/core-policy-runtime-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const peer=join(root,'peer'),log=join(root,'methods.jsonl');
 await writeFile(peer,`#!${process.execPath}\nconst log=${JSON.stringify(log)};\n`+String.raw`
const fs=require('node:fs');
const assert=require('node:assert/strict');
assert.deepEqual(process.argv.slice(2),['app-server','--listen','stdio://']);
assert.equal(process.env.CORE_CUA_APP_POLICY,undefined);
assert.equal(process.env.DEEPSEEK_API_KEY,undefined);
let clientName;
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
 const request=JSON.parse(line);
 if(request.method==='initialize') clientName=request.params.clientInfo.name;
 fs.appendFileSync(log,JSON.stringify({clientName,method:request.method})+'\n');
 let result;
 if(request.method==='initialize') {
  assert.ok(['core-computer-use','codex-browser-use'].includes(clientName));result={};
 } else if(request.method==='getAuthStatus' && clientName==='codex-browser-use') {
  result={}; // Owned peer supplies no authentication token.
 } else if(request.method==='configRequirements/read') {
  result={requirements:{computerUse:{defaultAppAccess:'deny',macos:{bundleIds:{'com.core.fixture.allowed':'allow','com.apple.Terminal':'allow'}}}}};
 } else if(request.method==='config/read') result={config:{}};
 else throw Error('Unexpected request');
 process.stdout.write(JSON.stringify({id:request.id,result})+'\n');
});
`,{mode:0o700});
 const app=async(id:string)=>{
  const path=join(root,id+'.app');await mkdir(join(path,'Contents'),{recursive:true});
  await writeFile(join(path,'Contents/Info.plist'),`<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${id}</string><key>CFBundleName</key><string>Policy Fixture</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
  return path;
 };
 const staged=await stageRuntimePackages([resolve('packages/sky'),resolve('packages/cua')]);t.after(()=>staged.dispose());
 const env=await readRuntimeEnvironment({CORE_CUA_POLICY_SOURCE:'app-server',CODEX_CLI_PATH:peer,DEEPSEEK_API_KEY:'fixture-model-secret',CUA_MCP_ENV:JSON.stringify({CUA_REPL_ENABLED_SURFACES:'computer',CORE_CUA_NATIVE_BACKEND:'swift'})});
 const runtime=await prepareIndependentRuntime(env,staged.root,'policy-runtime');t.after(()=>runtime.dispose());
 const transport=new StdioClientTransport({command:runtime.command,args:runtime.args,env:runtime.environment,stderr:'pipe'});
 const client=new Client({name:'owned-policy-runtime-test',version:'1.0'},{capabilities:{elicitation:{form:{}}}});
 let approvals=0;
 client.setRequestHandler(ElicitRequestSchema,()=>{approvals++;return {action:'decline'};});
 try {
  await client.connect(transport);
  const setup=await client.callTool({name:'js',arguments:{code:'await import("@core/cua/tinyskyAlt");'}});
  assert.equal(setup.isError,false,JSON.stringify(setup));
  for(const [id,expected] of [['com.core.fixture.allowed','not approved'],['com.core.fixture.denied',"organization's policy"],['com.apple.Terminal','safety reasons']]) {
   const path=await app(id);
   const result=await client.callTool({name:'js',arguments:{code:`await cua.getApp(${JSON.stringify(path)});`}});
   assert.equal(result.isError,true);
   assert.ok(JSON.stringify(result).includes(expected),JSON.stringify(result));
  }
  assert.equal(approvals,1,'Only the allowed app may reach approval; all operations are declined or blocked');
  assert.deepEqual((await readFile(log,'utf8')).trim().split('\n').map(line=>JSON.parse(line)).filter(item=>item.clientName==='core-computer-use').map(item=>item.method),['initialize','configRequirements/read','config/read']);
 } finally {await client.close();}
});

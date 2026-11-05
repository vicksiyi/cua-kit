import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {connect, type Socket} from 'node:net';
import {once} from 'node:events';
import {mkdtemp,realpath,access,rm,chmod,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {MacComputerUseClient} from '../packages/sky/src/targets/mac/client';
import {encodeMessageFrame,decodeMessageFrames} from '../packages/sky/src/targets/mac/native-pipe';
const helper=resolve('native/macos/.build/debug/cua-helper');
async function fixture(t:any) {
 const root=await realpath(await mkdtemp('/tmp/core-sky-ipc-'));await chmod(root,0o700);
 const path=join(root,'ipc.sock');
 const child=spawn(helper,['--sky-socket',path],{env:{PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8'},stdio:['ignore','ignore','pipe']});
 let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
 const exited=once(child,'exit');
 const sockets:Socket[]=[];
 t.after(async()=>{for(const socket of sockets)socket.destroy();if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await exited;await rm(root,{recursive:true,force:true});});
 for(let n=0;;n++) {try{await access(path);break;}catch{assert.ok(n<100&&child.exitCode===null,stderr);await new Promise(r=>setTimeout(r,10));}}
 const open=async()=>{const socket=connect(path);sockets.push(socket);await once(socket,'connect');return socket;};
 return {root,path,child,exited,open};
}
for(const source of ['restored','installed'] as const) test(`Swift IPC accepts ${source} Sky client handshake and app inventory`,{skip:process.platform!=='darwin'||process.env.CUA_TEST_NATIVE_SKY_IPC!=='1',timeout:10000},async t=>{
 const f=await fixture(t);
 const before=(globalThis as any).nodeRepl;
 (globalThis as any).nodeRepl={env:{SKY_CUA_SERVICE_NATIVE_PIPE_PATH:f.path},nativePipe:{createConnection:f.open},requestMeta:{'x-codex-turn-metadata':{session_id:'fixture',turn_id:'one'}}};
 try{
  const Client=source==='restored'?MacComputerUseClient:(await import(pathToFileURL('/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky/dist/project/cua/sky_js/src/targets/mac/client.js').href)).MacComputerUseClient;
  const client=new Client();const apps=await client.listApps();
  assert.ok(Array.isArray(apps));for(const app of apps){assert.equal(typeof app.isRunning,'boolean');assert.ok(app.displayName===undefined||typeof app.displayName==='string');}
  await assert.rejects(client.getAppState('com.example.not-running'),(error:any)=>error.code===-10003);
 }finally{(globalThis as any).nodeRepl=before;}
});
test('Swift IPC enforces negotiation, deadlines, frame limits and unknown-operation errors',{skip:process.platform!=='darwin'||process.env.CUA_TEST_NATIVE_SKY_IPC!=='1',timeout:10000},async t=>{
 const f=await fixture(t);const socket=await f.open();let buffer=Buffer.alloc(0);
 const pending:Array<(value:any)=>void>=[];
 socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);const decoded=decodeMessageFrames(buffer);buffer=decoded.remainingData;for(const body of decoded.messages)pending.shift()!(JSON.parse(body));});
 const send=async(value:any)=>{const response=new Promise<any>(r=>pending.push(r));const frame=encodeMessageFrame(JSON.stringify(value));socket.write(frame.subarray(0,2));socket.write(frame.subarray(2));return response;};
 const request={id:1,jsonrpc:'2.0',method:'request',params:{clientApiVersion:'CodexComputerUseIPC-5',deadlineUnixMilliseconds:Date.now()+5000,requestType:'ComputerUseIPCListAppsRequest',request:{}}};
 assert.equal((await send(request)).error.code,-32600);
 assert.equal((await send({id:2,jsonrpc:'2.0',method:'ping',params:{clientApiVersion:'wrong'}})).error.code,-10013);
 assert.equal((await send({id:3,jsonrpc:'2.0',method:'ping',params:{clientApiVersion:'CodexComputerUseIPC-5'}})).result.serverApiVersion,'CodexComputerUseIPC-5');
 assert.equal((await send({...request,id:4,params:{...request.params,deadlineUnixMilliseconds:0}})).error.code,-32602);
 assert.ok(Array.isArray((await send({...request,id:5})).result));
 const closed=once(socket,'close');const oversized=Buffer.alloc(4);oversized.writeUInt32LE(8388609);socket.write(oversized);await closed;
 const [code]=await f.exited;assert.equal(code,1);
});

test('restored CUA app inventory traverses Rust sandbox and original Sky service into Swift IPC',{skip:process.platform!=='darwin'||process.env.CUA_TEST_NATIVE_SKY_IPC!=='1',timeout:15000},async t=>{
 const f=await fixture(t);
 const {stageRuntimePackages}=await import('../packages/agent-loop/src/runtime-packages');
 const {McpToolClient}=await import('../packages/agent-loop/src/mcp-client');
 const staged=await stageRuntimePackages([resolve('packages/sky'),resolve('packages/cua')]);t.after(()=>staged.dispose());
 const kernel=join(f.root,'kernel'),trusted=join(f.root,'trusted');await Promise.all([mkdir(kernel),mkdir(trusted)]);
 const worker=(isTrusted:boolean)=>({sandbox:{node:process.execPath,bootstrap:resolve('packages/runtime-supervisor/dist/sandbox-bootstrap.js'),addon:resolve('native/macos-sandbox/dist/sandbox.node'),entry:resolve('packages/node-repl/dist/'+(isTrusted?'trusted_worker.js':'kernel.js')),args:isTrusted?[trusted]:['--session-id','sky-ipc','--working-dir',kernel],directory:isTrusted?trusted:kernel,read_directories:[resolve('packages/node-repl'),resolve('node_modules'),staged.root],worker_environment:{NODE_REPL_TRUSTED_RPC_ENABLED:'1',NODE_REPL_TRUSTED_SERVICES:JSON.stringify({sky:'@core/sky/service'}),NODE_REPL_TRUSTED_CODE_PATHS:staged.root,NODE_REPL_NODE_MODULE_DIRS:staged.root,NODE_REPL_UNTRUSTED_ENV_ALLOWLIST:'CUA_REPL_ENABLED_SURFACES',CUA_REPL_ENABLED_SURFACES:'computer',...(isTrusted?{SKY_CUA_SERVICE_NATIVE_PIPE_PATH:f.path}:{})}}});
 const config=join(f.root,'config.toml'),requirements=join(f.root,'requirements.toml');await Promise.all([writeFile(config,''),writeFile(requirements,'')]);
 const spec=join(f.root,'runtime.json');await writeFile(spec,JSON.stringify({kernel:worker(false),trusted:worker(true),services:['sky'],pipe_paths:[f.path],config:{config,requirements,working_directories:[trusted],toml_files:{}}}),{mode:0o600});
 const mcp=await McpToolClient.connect({command:resolve('native/runtime-supervisor/dist/core-runtime-supervisor'),args:[spec],env:{HOME:f.root,TMPDIR:f.root},stderr:'pipe'},{requestMeta:()=>({'x-codex-turn-metadata':{session_id:'sky-ipc',turn_id:'one'}})});
 try {
  const setup=await mcp.callTool({id:'setup',name:'js',arguments:{code:'await import("@core/cua/tinyskyAlt");'}});assert.equal(setup.isError,false,JSON.stringify(setup));
  const result=await mcp.callTool({id:'inventory',name:'js',arguments:{code:'{const state=await cua.getState({emit:false});nodeRepl.write(JSON.stringify({appCount:state.apps.length,browserCount:state.browsers.length}));}'}});assert.equal(result.isError,false,JSON.stringify(result));
  const body=result.content.filter(item=>item.type==='text').map(item=>item.text).join('\n');assert.match(body,/"appCount":\d+/);assert.match(body,/"browserCount":0/);
 } finally {await mcp.close();}
 const [status]=await f.exited;assert.equal(status,0,'Closing Rust workers must close the owned Swift connection');
 await assert.rejects(access(f.path),'Owned socket must be removed on normal EOF');
});

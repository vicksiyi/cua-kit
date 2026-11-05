import test from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,writeFile,readFile,rm,mkdir,chmod} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {ElicitRequestSchema} from '@modelcontextprotocol/sdk/types.js';

for(const closure of ['eof','sigterm'] as const) test(`Rust rmcp stdio drives restored workers and cleans up on ${closure}`,{skip:process.platform!=='darwin',timeout:30000},async()=>{
 const root=await realpath(await mkdtemp('/tmp/core-rust-mcp-'));await chmod(root,0o700);
 const moduleDir=join(root,'node_modules');await mkdir(join(moduleDir,'fixture'),{recursive:true});
 await writeFile(join(moduleDir,'fixture','package.json'),JSON.stringify({name:'fixture',type:'module',exports:'./index.js'}));await writeFile(join(moduleDir,'fixture','index.js'),'export const value=73;');
 const marker=join(root,'started');
 let workerPids:number[]=[];
 await writeFile(join(root,'service.mjs'),`let count=0;nodeRepl.addTurnEndedHandler({timeoutMs:1000,run:async()=>{count++;}});export async function handleRpc(x){if(x.ask)return await nodeRepl.createElicitation({message:'fixture approval',requestedSchema:{type:'object',properties:{}}});if(x.hang){await (await import('node:fs/promises')).writeFile(${JSON.stringify(marker)},'started');await new Promise(()=>{});}nodeRepl.setResponseMeta({fixture:true});return {count,meta:nodeRepl.requestMeta};}`);
 for(const name of ['config','requirements','browser'])await writeFile(join(root,name+'.toml'),'');
 const env={HOME:root,TMPDIR:root,NODE_REPL_TRUSTED_RPC_ENABLED:'1',NODE_REPL_TRUSTED_SERVICES:JSON.stringify({fixture:join(root,'service.mjs')}),NODE_REPL_TRUSTED_CODE_PATHS:root,NODE_REPL_ENABLE_AUDIO:'1'};
 const worker=(entry:string,args:string[])=>({command:'/usr/bin/sandbox-exec',args:['-p','(version 1)(allow default)(deny network*)',process.execPath,'--experimental-vm-modules',resolve('packages/node-repl/dist/'+entry),...args],cwd:root,env});
 const spec=join(root,'spec.json');await writeFile(spec,JSON.stringify({kernel:worker('kernel.js',['--session-id','fixture','--working-dir',root]),trusted:worker('trusted_worker.js',[root]),services:['fixture'],module_directories:[moduleDir],config:{config:join(root,'config.toml'),requirements:join(root,'requirements.toml'),working_directories:[root],toml_files:{'browser/config.toml':join(root,'browser.toml')}},writable_paths:['browser/config.toml']}),{mode:0o600});
 const transport=new StdioClientTransport({command:resolve('native/runtime-supervisor/target/debug/examples/mcp_stdio'),args:[spec],env:{HOME:root,TMPDIR:root},stderr:'pipe'});
 const client=new Client({name:'rust-acceptance',version:'1'},{capabilities:{elicitation:{form:{}}}});
 let approvals=0;client.setRequestHandler(ElicitRequestSchema,()=>{approvals++;return {action:'decline' as const};});
 let stderr='';transport.stderr?.on('data',chunk=>{stderr+=chunk.toString();});
 try{
  await client.connect(transport);
  const tools=(await client.listTools()).tools;assert.deepEqual(tools.map(tool=>tool.name),['js','js_add_node_module_dir','js_reset','turn_ended']);
  const call=(name:string,args:Record<string,unknown>)=>client.callTool({name,arguments:args,_meta:{hostMarker:'trusted-test'}});
  const js=async(code:string)=>{const result=await call('js',{code});assert.equal(result.isError,false,JSON.stringify(result));return result;};
  assert.match(JSON.stringify((await js('let value=40;nodeRepl.write(value+2)')).content),/42/);
  const named=await js('nodeRepl.write("named docs", "docs")');assert.match(JSON.stringify(named.content),/named docs/);
  assert.equal((await call('js',{code:'1',extra:true})).isError,true);
  assert.equal((await call('js',{code:'1',timeout_ms:null})).isError,true);
  assert.equal((await call('js',{code:'1',title:null})).isError,true);
  assert.equal((await call('js_add_node_module_dir',{path:root})).isError,true);
  assert.equal((await call('js_add_node_module_dir',{path:moduleDir})).isError,false);
  assert.match(JSON.stringify((await js("nodeRepl.write((await import('fixture')).value)")).content),/73/);
  const rpc=await js("nodeRepl.write(await nodeRepl.rpc('fixture',{}))");assert.match(JSON.stringify(rpc.content),/trusted-test/);assert.equal(rpc._meta?.fixture,true);
  assert.match(JSON.stringify((await js("nodeRepl.write(await nodeRepl.rpc('fixture',{ask:true}))")).content),/decline/);assert.equal(approvals,1);
  const image=await js("await nodeRepl.emitImage('data:image/png;base64,iVBORw0KGgo=')");assert.ok((image.content as any[]).some(item=>item.type==='image'&&item.data==='iVBORw0KGgo='));
  const event={hook_event_name:'turn_ended',session_id:'fixture',turn_id:'one'};
  await call('turn_ended',event);await call('turn_ended',event);assert.match(JSON.stringify((await js("nodeRepl.write((await nodeRepl.rpc('fixture',{})).count)")).content),/1/);
  await call('js_reset',{});assert.match(JSON.stringify((await js('nodeRepl.write(typeof value)')).content),/undefined/);assert.match(JSON.stringify((await js("nodeRepl.write((await import('fixture')).value)")).content),/73/);
  assert.equal((await call('js',{code:'while(true){}',timeout_ms:100})).isError,true);
  await js('let stale=1');const controller=new AbortController();
  const pending=client.callTool({name:'js',arguments:{code:"await nodeRepl.rpc('fixture',{hang:true})"}},undefined,{signal:controller.signal}).then(()=>false,()=>true);
  for(let n=0;;n++){try{await readFile(marker);break;}catch{assert.ok(n<100,'worker never started');await new Promise(r=>setTimeout(r,20));}}
  controller.abort();assert.equal(await pending,true);
  assert.match(JSON.stringify((await js('nodeRepl.write(typeof stale)')).content),/undefined/);
  const {stdout}=await promisify(execFile)('/bin/ps',['-axo','pid=,ppid=']);
  workerPids=stdout.split('\n').map(line=>line.trim().split(/\s+/).map(Number)).filter(([,parent])=>parent===transport.pid).map(([pid])=>pid);
  assert.equal(workerPids.length,2,'Expected owned kernel and trusted worker');
  if(closure==='sigterm'){
    await rm(marker,{force:true});
    const active=client.callTool({name:'js',arguments:{code:"await nodeRepl.rpc('fixture',{hang:true})"}}).catch(()=>undefined);
    for(let n=0;;n++){try{await readFile(marker);break;}catch{assert.ok(n<100);await new Promise(r=>setTimeout(r,20));}}
    const closed=new Promise<void>(resolve=>{client.onclose=resolve;});process.kill(transport.pid!,'SIGTERM');await closed;await active;
  }
 }finally{await client.close();await rm(root,{recursive:true,force:true});}
 assert.equal(stderr,'');
 for(const pid of workerPids)assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
});

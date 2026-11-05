import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,chmod,writeFile,readFile,readdir,rm,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {McpToolClient} from '../packages/agent-loop/src/mcp-client';
import {prepareIndependentRuntime} from '../packages/agent-loop/src/independent-runtime';
import {stageRuntimePackages} from '../packages/agent-loop/src/runtime-packages';

for (const duration of (process.env.CUA_TEST_AUDIO_DURATION_MS ? [Number(process.env.CUA_TEST_AUDIO_DURATION_MS)] : [100,300000])) test(`synthetic ${duration} ms WAV traverses Rust MCP and trusted Sky filesystem while kernel read stays denied`,{
 skip:process.platform!=='darwin'||process.env.CUA_TEST_NATIVE_SKY_IPC!=='1',timeout:60000,
},async t=>{
 const root=await realpath(await mkdtemp('/tmp/core-audio-rpc-'));await chmod(root,0o700);
 t.after(()=>rm(root,{recursive:true,force:true}));
 const fixture=join(root,'synthetic-helper');
 const helper=resolve('native/macos/.build/debug/cua-helper');
 const quote=(value:string)=>"'"+value.replaceAll("'","'\\''")+"'";
 await writeFile(fixture,`#!/bin/sh\n[ "$1" = '--sky-socket' ] || exit 2\nexec ${quote(helper)} --synthetic-audio-socket "$2"\n`,{mode:0o700});
 const staged=await stageRuntimePackages([resolve('packages/sky')]);t.after(()=>staged.dispose());
 const runtime=await prepareIndependentRuntime({CUA_REPL_ENABLED_SURFACES:'computer',CORE_CUA_NATIVE_BACKEND:'swift',CORE_CUA_NATIVE_HELPER_PATH:fixture,SKY_ENABLE_AUDIO:'1',NODE_REPL_ENABLE_AUDIO:'1',SKY_AUDIO_MODEL_ALLOWLIST:'["fixture-audio"]'},staged.root,'audio-fixture','rust');
 t.after(()=>runtime.dispose());
 const spec=JSON.parse(await readFile(runtime.args[0],'utf8'));
 assert.equal(spec.trusted.sandbox.worker_environment.SKY_ENABLE_AUDIO,'1');
 assert.equal(spec.kernel.sandbox.worker_environment.SKY_ENABLE_AUDIO,undefined);
 let approvals=0;let action:'accept'|'decline'='decline';let currentModel='fixture-audio';
 const mcp=await McpToolClient.connect({command:runtime.command,args:runtime.args,env:runtime.environment,stderr:'ignore'},{
  requestMeta:()=>({'x-codex-turn-metadata':{session_id:'audio-fixture',turn_id:'one',model:currentModel}}),
  elicit:request=>{approvals++;assert.match(request.message,/record computer audio/);assert.equal(request._meta?.riskLevel,'high');return {action};},
 });
 let callNumber=0;
 const call=async(code:string,model='fixture-audio')=>{
  currentModel=model;
  return mcp.callTool({id:`fixture-${++callNumber}`,name:'js',arguments:{code}});
 };
 const output=(value:any)=>value.content.filter((part:any)=>part.type==='text').map((part:any)=>part.text).join('\n');
 let audioPath='';
 try {
  const setup=await call('var skyAudio = (await import("@core/sky")).sky;');assert.equal(setup.isError,false,output(setup));
  const blocked=await call('await skyAudio.start_audio_recording({max_duration_ms:100});','unsupported');
  assert.equal(blocked.isError,true);assert.match(output(blocked),/supports audio input/);assert.equal(approvals,0);
  const denied=await call('await skyAudio.start_audio_recording({max_duration_ms:100});');
  assert.equal(denied.isError,true);assert.match(output(denied),/not approved/);assert.equal(approvals,1);
  const serviceRoot=join(spec.native_service.directory,(await readdir(spec.native_service.directory)).find(name=>name.startsWith('sky-'))!);
  assert.equal((await readdir(serviceRoot)).some(name=>name.startsWith('audio-')),false);
  action='accept';
  const started=await call(`await skyAudio.start_audio_recording({max_duration_ms:${duration}});`);assert.equal(started.isError,false,output(started));assert.equal(approvals,2);
  const stopped=await call('var syntheticAudio = await skyAudio.stop_audio_recording(); nodeRepl.write(JSON.stringify({filepath:syntheticAudio.filepath,length:syntheticAudio.bytes.length,prefix:Array.from(syntheticAudio.bytes.slice(0,12)),wav:syntheticAudio.data_url.startsWith("data:audio/wav;base64,")}));');
  assert.equal(stopped.isError,false,output(stopped));
  const summary=JSON.parse(output(stopped));audioPath=summary.filepath;
  assert.ok(audioPath.startsWith(serviceRoot+'/audio-'));assert.ok(summary.length>=duration*96 && summary.length<duration*96+65536,'PCM payload must cover the full requested duration');assert.equal(summary.wav,true);
  assert.equal(Buffer.from(summary.prefix).subarray(0,4).toString(),'RIFF');
  assert.equal(Buffer.from(summary.prefix).subarray(8,12).toString(),'WAVE');
  const bytes=await readFile(audioPath);assert.equal(bytes.length,summary.length);
  const emitted=await call('await nodeRepl.emitAudio(syntheticAudio.data_url);');
  assert.equal(emitted.isError,false,output(emitted));
  const audio=(emitted.content as any[]).find(part=>part.type==='audio');
  assert.ok(audio);assert.equal(audio.mimeType,'audio/wav');assert.deepEqual(Buffer.from(audio.data,'base64'),bytes);
  const deniedRead=await call(`try { await (await import("node:fs/promises")).readFile(${JSON.stringify(audioPath)}); nodeRepl.write("UNEXPECTED_READ"); } catch (error) { nodeRepl.write(String(error.code)); }`);
  assert.equal(deniedRead.isError,false,output(deniedRead));assert.match(output(deniedRead),/EPERM|EACCES/);
 } finally {await mcp.close();}
 assert.ok(audioPath);await assert.rejects(access(audioPath));
 assert.equal((await readdir(spec.native_service.directory)).length,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ChatCompletionsModel} from '../packages/agent-loop/src/chat-model';
import {createDebugLog} from '../packages/agent-loop/src/debug-log';
import {createTerminalTrace} from '../packages/agent-loop/src/terminal-trace';
import type {AgentMessage} from '../packages/agent-loop/src/contracts';
const data=Buffer.from('synthetic-private-audio-samples').toString('base64');
const message: AgentMessage={role:'tool',callId:'audio-1',name:'js',result:{content:[{type:'audio',mimeType:'audio/wav',data}]}};
test('text/image demo adapter rejects audio before any model request',async()=>{
 const original=globalThis.fetch;let requests=0;
 globalThis.fetch=async()=>{requests++;throw Error('Unexpected network request');};
 try{
  const model=new ChatCompletionsModel({endpoint:'https://example.invalid',apiKey:'fixture',model:'fixture'});
  await assert.rejects(model.decide({system:'fixture',messages:[message],tools:[]}),/does not support audio input/);
  assert.equal(requests,0);
 }finally{globalThis.fetch=original;}
});
test('audio diagnostics omit raw samples and terminal output identifies audio',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'core-audio-log-'));
 try{
  const log=createDebugLog(directory);log.write('tool.result',message);
  const text=await readFile(log.file,'utf8');assert.ok(!text.includes(data));assert.match(text,/"type":"audio"/);assert.match(text,/"omitted":true/);
  const lines:string[]=[];createTerminalTrace({},line=>lines.push(line))(message);
  assert.match(lines.join('\n'),/Audio returned \(audio\/wav/);assert.ok(!lines.join('\n').includes(data));
 }finally{await rm(directory,{recursive:true,force:true});}
});

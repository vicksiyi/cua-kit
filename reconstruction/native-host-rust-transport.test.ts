import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {endianness} from 'node:os';
import {encodeNativePipeFrame,NativePipeFrameDecoder} from '../packages/browser/src/service/runtime/native_pipe';
const enabled=process.env.CUA_TEST_RUST_HOST_ROUTER==='1';
const binary=resolve('native/browser-extension-host/target/debug/examples/framed_echo');
test('restored JS framing exchanges actual stdio frames with Rust transport',{skip:!enabled},()=>{
 const messages=[{jsonrpc:'2.0',id:'中文-id',method:'fixture',params:{text:'🙂\nline'}},{jsonrpc:'2.0',id:3},{jsonrpc:'2.0',method:'onCDPEvent',params:{data:'x'.repeat(80_000)}}];
 const result=spawnSync(binary,[],{input:Buffer.concat(messages.map(message=>encodeNativePipeFrame(JSON.stringify(message)))),timeout:5000,maxBuffer:1024*1024});
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr.toString());
 const decoder=new NativePipeFrameDecoder(1024*1024),actual:unknown[]=[];
 for(let offset=0;offset<result.stdout.length;offset+=127)actual.push(...decoder.push(result.stdout.subarray(offset,offset+127)).map(frame=>JSON.parse(frame)));
 assert.deepEqual(actual,messages);assert.equal(decoder.byteLength,0);
});
test('native framed stdio rejects oversized headers and truncated messages',{skip:!enabled},()=>{
 const oversized=Buffer.alloc(4);if(endianness()==='LE')oversized.writeUInt32LE(1024*1024+1);else oversized.writeUInt32BE(1024*1024+1);
 for(const input of [oversized,Buffer.from([1]),encodeNativePipeFrame('{"secret":"fixture"}').subarray(0,10)]){
  const result=spawnSync(binary,[],{input,timeout:5000});assert.equal(result.error,undefined);assert.equal(result.status,1);assert.equal(result.stdout.length,0);assert.equal(result.stderr.toString(),'native frame transport failed\n');
 }
});

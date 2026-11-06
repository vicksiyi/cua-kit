import test from 'node:test';import assert from 'node:assert/strict';
import {createWireObserver} from '../scripts/lib/browser-wire-trace.mjs';
const frame=(v,le=true)=>{const body=Buffer.from(JSON.stringify(v)),head=Buffer.alloc(4);le?head.writeUInt32LE(body.length):head.writeUInt32BE(body.length);return Buffer.concat([head,body]);};
test('wire observer reassembles frames and excludes secrets, expressions and page payloads',()=>{
 for(const le of [true,false]){
  const rows=[],observe=createWireObserver(v=>rows.push(v),le);
  const bytes=Buffer.concat([
   frame({type:'core-cua-auth',token:'SECRET'},le),
   frame({jsonrpc:'2.0',id:3,method:'executeCdp',params:{method:'Runtime.evaluate',target:{tabId:9},commandParams:{expression:'PRIVATE_EXPRESSION'}}},le),
   frame({jsonrpc:'2.0',id:3,error:{code:-1,message:'PRIVATE_ERROR'},result:{body:'PRIVATE_PAGE'}},le),
   frame({jsonrpc:'2.0',method:'onCDPDetach',params:{tabId:9}},le),
  ]);
  for(let i=0;i<bytes.length;i+=7)observe(bytes.subarray(i,i+7));
  const output=JSON.stringify(rows);assert.equal(rows.length,3);assert(!/SECRET|PRIVATE/.test(output));
  assert.equal(rows[0].cdp,'Runtime.evaluate');assert.equal(rows[0].tabId,9);assert.equal(rows[1].errorCode,-1);assert.equal(rows[2].method,'onCDPDetach');
 }
});
test('oversized frames disable metadata parsing without emitting their bytes',()=>{
 const rows=[],observe=createWireObserver(v=>rows.push(v),true),header=Buffer.alloc(4);header.writeUInt32LE(16777217);observe(header);observe(frame({jsonrpc:'2.0',id:1}));assert.deepEqual(rows,[{diagnostic:'frame-too-large'}]);
});

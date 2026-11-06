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
test('RPC error categories expose no raw message or structured payload',()=>{
 const rows=[],observe=createWireObserver(v=>rows.push(v),true);
 for(const error of [
  {code:-1,message:'Detached while handling command PRIVATE_URL'},
  {code:-1,message:'Debugger unattached PRIVATE_TOKEN'},
  {code:-1,message:'Debugger is not attached PRIVATE_URL'},
  {code:-32601,message:'PRIVATE_METHOD'},
  {code:-1,message:'PRIVATE_ERROR',data:{token:'SECRET'}},
  {code:-1,message:{private:'SECRET'}},
 ])observe(frame({jsonrpc:'2.0',id:1,error}));
 assert.deepEqual(rows.map(row=>row.errorKind),['detached-during-command','debugger-unattached','debugger-unattached','method-not-found','other','other']);
 assert(!/SECRET|PRIVATE/.test(JSON.stringify(rows)));
});

test('only the CDP command deadline format gets the timeout diagnostic',()=>{
 const rows=[],observe=createWireObserver(v=>rows.push(v),true);
 for(const message of [
  'Timed out after 10000ms waiting for CDP command Runtime.evaluate.',
  'Timed out after 0.5ms waiting for CDP command Page.navigate.',
  'Timed out waiting for selector PRIVATE_SELECTOR',
  'Timed out after 10000ms waiting for CDP command PRIVATE_URL https://private.test.',
  'Timed out after 10000ms waiting for CDP command Runtime.evaluate. PRIVATE_TOKEN',
 ])observe(frame({jsonrpc:'2.0',id:7,error:{code:-32000,message}}));
 assert.deepEqual(rows.map(row=>row.errorKind),['cdp-command-timeout','cdp-command-timeout','other','other','other']);
 assert(!/PRIVATE|private.test/.test(JSON.stringify(rows)));
});

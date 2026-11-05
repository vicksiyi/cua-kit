/** Core-compatibility differential, NOT a differential against the installed native binary. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {NativeHostRouter} from '../packages/native-host/src/router';
const rpc=(id:unknown,method:string)=>({jsonrpc:'2.0',id,method});
const events=[
 {event:'extension',message:rpc(1,'ping')},
 {event:'add',client:'a'},{event:'add',client:'b'},{event:'add',client:'a'},
 {event:'client',client:'missing',message:rpc(1,'getInfo')},
 {event:'client',client:'a',message:rpc(7,'getInfo')},
 {event:'client',client:'b',message:rpc(7,'getInfo')},
 {event:'client',client:'b',message:rpc(8,'getInfo')},
 {event:'extension',message:{jsonrpc:'2.0',id:'core-native:2',result:'second'}},
 {event:'extension',message:{jsonrpc:'2.0',id:'core-native:1'}},
 {event:'extension',message:{jsonrpc:'2.0',id:'core-native:1',result:'stale'}},
 {event:'extension',message:{jsonrpc:'2.0',method:'onCDPEvent',params:{method:'fixture'}}},
 {event:'client',client:'a',message:{jsonrpc:'2.0',method:'fixtureNotification'}},
 {event:'extension',message:rpc(2,'ping')},
 {event:'client',client:'a',message:{jsonrpc:'2.0',id:'core-client:3',error:{message:'no'}}},
 {event:'client',client:'a',message:{jsonrpc:'2.0',id:'core-client:3',result:'duplicate'}},
 {event:'client',client:'b',message:{jsonrpc:'2.0',id:'core-client:3',result:'pong'}},
 {event:'extension',message:rpc(3,'ping')},
 {event:'remove',client:'a'},{event:'remove',client:'b'},
 {event:'add',client:'a'},
 {event:'extension',message:rpc(9,'unknown')},
 {event:'client',client:'a',message:{jsonrpc:'2.0',id:null}},
 {event:'client',client:'a',message:{jsonrpc:'2.0',method:true}},
 {event:'client',client:'a',message:{jsonrpc:'1.0'}},
 {event:'client',client:'a',message:null},
 {event:'client',client:'a',message:rpc('text-id','getInfo')},
 {event:'close'},
 {event:'extension',message:{jsonrpc:'2.0',id:'core-native:5',result:'after-close'}},
 {event:'client',client:'a',message:rpc(1,'getInfo')},
];
test('Rust routing preserves current Core multi-client contract (30 state transitions)',{
 skip:process.env.CUA_TEST_RUST_HOST_ROUTER!=='1',
},()=>{
 let output:any[]=[];
 const router=new NativeHostRouter(message=>output.push({destination:'extension',message}),1_000_000,2);
 const reference=events.map((event:any)=>{
  output=[];
  try{
   switch(event.event){
    case 'add':router.addClient(event.client,message=>output.push({destination:`client:${event.client}`,message}));break;
    case 'remove':router.removeClient(event.client);break;
    case 'client':router.fromClient(event.client,event.message);break;
    case 'extension':router.fromExtension(event.message);break;
    case 'close':router.close();break;
   }
   return {deliveries:output};
  }catch(error){return {error:(error as Error).message};}
 });
 router.close();
 const native=spawnSync(resolve('native/browser-extension-host/target/debug/examples/router_contract'),[],{
  input:events.map(event=>JSON.stringify(event)).join('\n')+'\n',encoding:'utf8',timeout:5000,
 });
 assert.equal(native.error,undefined);assert.equal(native.status,0,native.stderr);
 const actual=native.stdout.trim().split('\n').map(line=>JSON.parse(line));
 assert.equal(actual.length,events.length);
 for(let i=0;i<events.length;i++)assert.deepEqual(actual[i],reference[i],`transition ${i}: ${JSON.stringify(events[i])}`);
});

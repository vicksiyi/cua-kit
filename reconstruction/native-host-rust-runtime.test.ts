/** Full Rust Core host with restored peers and owned fixtures, not original host parity. */
import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,realpath,writeFile,readFile,rm,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createConnection} from 'node:net';
import {once} from 'node:events';
import {connectNativeHost} from '../packages/native-host/src/client';
import {BrowserRpcPeer} from '../packages/core/src/browser_rpc_peer';
import {ExtensionBrowserPeer} from '../packages/browser-extension/src/browser_peer';
import {NativePipeFrameDecoder,encodeNativePipeFrame} from '../packages/browser/src/service/runtime/native_pipe';
const enabled=process.platform!=='win32'&&process.env.CUA_TEST_RUST_HOST_ROUTER==='1';
const origin=`chrome-extension://${'a'.repeat(32)}/`;
async function start(t:TestContext,requestedOrigin=origin){
 const root=await realpath(await mkdtemp('/tmp/cua-native-runtime-'));
 const parent=join(root,'hosts'),config=join(root,'config.json');
 await writeFile(config,JSON.stringify({version:1,extensionIds:['a'.repeat(32)],endpointParentDirectory:parent}),{mode:0o600});
 const child=spawn(resolve('native/browser-extension-host/target/debug/core-browser-extension-host'),['--config',config,requestedOrigin],{stdio:['pipe','pipe','pipe']});
 const closed=new Promise<number|null>((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
 let stderr='';let readyResolve!:(file:string)=>void;
 const readyLine=new Promise<string>(resolve=>readyResolve=resolve);
 child.stderr.on('data',bytes=>{stderr+=bytes.toString();const match=stderr.match(/@core native host endpoint: ([^\r\n]+)/);if(match)readyResolve(match[1]);});
 const ready=()=>Promise.race([readyLine,closed.then(()=>{throw Error(`Rust host closed before ready: ${stderr}`);})]);
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await closed;await rm(root,{recursive:true,force:true});});
 return {child,closed,ready,parent,stderr:()=>stderr};
}
function extensionFor(child:ReturnType<typeof spawn>,handlers:Record<string,unknown>){
 let callback:(message:any)=>void=()=>{};
 const extension=new ExtensionBrowserPeer({
  setMessageCallback(fn){callback=fn;},
  sendMessage(message){const frame=encodeNativePipeFrame(JSON.stringify(message));child.stdin!.write(frame.subarray(0,2));child.stdin!.write(frame.subarray(2));},
 },handlers as any);
 const decoder=new NativePipeFrameDecoder(1024*1024);
 child.stdout!.on('data',bytes=>{for(const frame of decoder.push(bytes))callback(JSON.parse(frame));});
 return extension;
}
test('Rust stdio host routes colliding IDs, void replies and notifications with restored peers',{skip:!enabled,timeout:10000},async t=>{
 const host=await start(t);
 const extension=extensionFor(host.child,{async getInfo(params:any){await new Promise(resolve=>setTimeout(resolve,params.delay));return {session:params.session_id};},turnEnded(){}});
 const file=await host.ready();const endpoint=JSON.parse(await readFile(file,'utf8'));
 await assert.rejects(connectNativeHost({...endpoint,token:'invalid'}),/closed|EPIPE|ECONNRESET/);
 const stalled=createConnection(endpoint.socketPath);stalled.on('error',()=>{});t.after(()=>stalled.destroy());await once(stalled,'connect'); // No auth bytes: other clients must still make progress.
 const transports=await Promise.all([connectNativeHost(endpoint),connectNativeHost(endpoint)]);t.after(()=>Promise.all(transports.map(transport=>transport.close())));
 const peers=transports.map(transport=>new BrowserRpcPeer(transport));
 const results=await Promise.all(peers.map((peer,index)=>peer.sendRequest('getInfo',{session_id:`s${index}`,delay:index===0?40:0})));
 assert.deepEqual(results,[{session:'s0'},{session:'s1'}]);assert.equal(await peers[0].sendRequest('turnEnded',{}),undefined);
 const events=peers.map(peer=>new Promise(resolve=>peer.addEventListener('onCDPEvent',resolve)));
 extension.sendCdpEvent({method:'Page.loadEventFired'});assert.deepEqual(await Promise.all(events),[{method:'Page.loadEventFired'},{method:'Page.loadEventFired'}]);
 await assert.rejects(peers[0].sendRequest('missingMethod'),/No handler/);
 host.child.stdin.end();assert.equal(await host.closed,0,host.stderr());await assert.rejects(access(file));
});
for(const closure of ['eof','sigterm','sigint'] as const)test(`Rust host ${closure} cancels in-flight RPC and pending authentication and removes endpoint`,{skip:!enabled,timeout:10000},async t=>{
 const host=await start(t);let received!:()=>void;const requestReceived=new Promise<void>(resolve=>received=resolve);
 extensionFor(host.child,{getInfo(){received();return new Promise(()=>{});}});
 const file=await host.ready();const endpoint=JSON.parse(await readFile(file,'utf8'));
 const transport=await connectNativeHost(endpoint);t.after(()=>transport.close());const peer=new BrowserRpcPeer(transport);
 const rejected=assert.rejects(peer.sendRequest('getInfo',{}),/closed/);await requestReceived;
 const pending=createConnection(endpoint.socketPath);pending.on('error',()=>{});t.after(()=>pending.destroy());await once(pending,'connect');
 if(closure==='eof')host.child.stdin.end();else host.child.kill(closure==='sigterm'?'SIGTERM':'SIGINT');
 await rejected;assert.equal(await host.closed,0,host.stderr());await assert.rejects(access(file));
});
test('Rust host rejects unregistered origin before creating endpoint or stdout frames',{skip:!enabled,timeout:10000},async t=>{
 const host=await start(t,`chrome-extension://${'b'.repeat(32)}/`);let output=0;host.child.stdout.on('data',bytes=>output+=bytes.length);
 assert.equal(await host.closed,1);assert.equal(output,0);await assert.rejects(access(host.parent));
});
test('Rust host cleans up after truncated extension input',{skip:!enabled,timeout:10000},async t=>{
 const host=await start(t);host.child.stdout.resume();const file=await host.ready();host.child.stdin.end(Buffer.from([1]));assert.equal(await host.closed,1);await assert.rejects(access(file));
});

test('Rust host cleans up when the extension stops reading stdout',{skip:!enabled,timeout:10000},async t=>{
 const host=await start(t);const file=await host.ready();host.child.stdout.destroy();assert.equal(await host.closed,1);await assert.rejects(access(file));
});

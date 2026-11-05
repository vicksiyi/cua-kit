/** Owned Core endpoint integration; does not call the installed original host. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtemp,realpath,readFile,rm,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {authenticateNativeHostSocket,connectNativeHost} from '../packages/native-host/src/client';
import {discoverLiveEndpointFiles} from '../packages/native-host/src/browser_connector';
import {BrowserRpcPeer} from '../packages/core/src/browser_rpc_peer';
test('existing Core client discovers and authenticates Rust-owned Unix endpoint, then cleanup removes descriptor',{
 skip:process.platform==='win32'||process.env.CUA_TEST_RUST_HOST_ROUTER!=='1',timeout:10000,
},async t=>{
 const parent=await realpath(await mkdtemp('/tmp/cua-rust-host-'));t.after(()=>rm(parent,{recursive:true,force:true}));
 const child=spawn(resolve('native/browser-extension-host/target/debug/examples/endpoint_probe'),[parent],{stdio:['ignore','pipe','pipe']});
 const closed=new Promise<number|null>((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
 t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
 let stderr='';child.stderr.on('data',bytes=>stderr+=bytes.toString());
 const lines=createInterface({input:child.stdout});
 const file=await Promise.race([new Promise<string>(resolve=>lines.once('line',resolve)),closed.then(()=>{throw Error('Probe exited before endpoint publication');})]);
 const endpoint=JSON.parse(await readFile(file,'utf8'));
 await assert.rejects(authenticateNativeHostSocket({...endpoint,token:'0'.repeat(64)}),/closed/);
 assert.deepEqual(await discoverLiveEndpointFiles(parent),[file]);
 const transport=await connectNativeHost(endpoint);t.after(()=>transport.close());
 const peer=new BrowserRpcPeer(transport);
 const result=await peer.sendRequest('fixtureEcho',{marker:'owned-rust-endpoint'});
 assert.deepEqual(result,{marker:'owned-rust-endpoint'});
 assert.equal(await closed,0,stderr);
 await assert.rejects(access(file));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,chmod,readFile,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {startRustNativeHost} from '../packages/native-host/src/native_process';
import {discoverLiveEndpointFiles} from '../packages/native-host/src/browser_connector';
import {IndependentBrowserUnavailableError} from '../packages/native-host/src/endpoint_configuration';

async function root(t:any){const dir=await mkdtemp('/tmp/cua-live-');t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
async function stale(dir:string){const d=join(dir,'core-cua-stale');await mkdir(d,{mode:0o700});const file=join(d,'endpoint.json');await writeFile(file,JSON.stringify({version:1,socketPath:join(d,'host.sock'),token:'a'.repeat(64)}),{mode:0o600});return file;}
test('missing sockets are skipped alongside a real authenticated host, without deleting evidence',async t=>{
  const dir=await root(t),file=await stale(dir);
  const host=await startRustNativeHost(new PassThrough(),new PassThrough(),{parentDirectory:dir});t.after(()=>host.close());
  assert.deepEqual(await discoverLiveEndpointFiles(dir),[host.endpointFile]);
  assert.ok(await readFile(file,'utf8'));
});
test('only missing sockets reports unavailable, while unsafe descriptors remain errors',async t=>{
  const dir=await root(t),file=await stale(dir);
  await assert.rejects(discoverLiveEndpointFiles(dir),e=>e instanceof IndependentBrowserUnavailableError&&e.reason==='no_endpoints');
  await chmod(file,0o644);
  await assert.rejects(discoverLiveEndpointFiles(dir),/private/);
});
test('a process killed without cleanup leaves a socket which is rejected as stale',async t=>{
  const dir=await root(t),file=await stale(dir),endpoint=JSON.parse(await readFile(file,'utf8'));
  const child=spawn(process.execPath,['--input-type=module','-e',"import net from 'node:net'; import fs from 'node:fs'; net.createServer().listen(process.argv[1],()=>{fs.chmodSync(process.argv[1],0o600);console.log('ready')});",endpoint.socketPath],{stdio:['ignore','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
  await once(child.stdout,'data');const exit=once(child,'exit');child.kill('SIGKILL');await exit;
  assert.ok((await stat(endpoint.socketPath)).isSocket());
  await assert.rejects(discoverLiveEndpointFiles(dir),e=>e instanceof IndependentBrowserUnavailableError);
  assert.ok((await stat(endpoint.socketPath)).isSocket());
});
test('wrong authentication token is not concealed as a missing browser',async t=>{
  const dir=await root(t);const host=await startRustNativeHost(new PassThrough(),new PassThrough(),{parentDirectory:dir});t.after(()=>host.close());
  await writeFile(host.endpointFile,JSON.stringify({...host.endpoint,token:'b'.repeat(64)}));
  await assert.rejects(discoverLiveEndpointFiles(dir),e=>e instanceof Error&&!(e instanceof IndependentBrowserUnavailableError)&&/authentication/.test(e.message));
});

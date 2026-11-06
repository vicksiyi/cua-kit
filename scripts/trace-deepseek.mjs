/** Opt-in local diagnostic proxy. It forwards unchanged bytes and does not approve actions. */
import net from 'node:net';
import fs from 'node:fs/promises';
import {writeSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadEnvFile} from 'node:process';
import {join} from 'node:path';
import {discoverLiveEndpointFiles,createBrowserServiceConnector,parseEndpointFiles} from '../packages/native-host/dist/browser-connector.mjs';
import {createWireObserver} from './lib/browser-wire-trace.mjs';
const project=fileURLToPath(new URL('../',import.meta.url));
if(!process.argv.slice(2).length) throw Error('Usage: node scripts/trace-deepseek.mjs "browser task"');
try{loadEnvFile(join(project,'.env'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(process.argv.slice(2).some(arg=>['--cdp-browser','--managed-browser','--computer','--cdp-endpoint'].includes(arg)))
  throw Error('Wire tracing targets the existing extension backend; backend-changing flags are not supported.');
const configured=JSON.parse(process.env.CUA_MCP_ENV??'{}');
if(configured.CORE_CUA_ENDPOINT_FILES!==undefined||configured.CORE_CUA_HOST_DIRECTORY!==undefined)
  throw Error('Select endpoints through CORE_CUA_ENDPOINT_FILES or CORE_CUA_HOST_DIRECTORY, outside CUA_MCP_ENV, when tracing.');
const files=process.env.CORE_CUA_ENDPOINT_FILES
  ? parseEndpointFiles(process.env.CORE_CUA_ENDPOINT_FILES)
  : await discoverLiveEndpointFiles(process.env.CORE_CUA_HOST_DIRECTORY??join(process.env.HOME,'.core-cua/endpoints'));
if(files.length!==1)throw Error('Trace requires exactly one endpoint; select CORE_CUA_ENDPOINT_FILES explicitly.');
await createBrowserServiceConnector(files); // Validate private descriptor/socket ownership before reading.
const endpoint=JSON.parse(await fs.readFile(files[0],'utf8'));
const parent=join(project,'artifacts/debug');await fs.mkdir(parent,{recursive:true});
const directory=await fs.realpath(await fs.mkdtemp(join(parent,'wire-')));await fs.chmod(directory,0o700);
// Unix-domain paths have a small platform limit; keep the socket in a private short directory.
const socketDirectory=await fs.realpath(await fs.mkdtemp('/tmp/core-wire-'));await fs.chmod(socketDirectory,0o700);
const socketPath=join(socketDirectory,'host.sock');
const proxyDescriptor=join(socketDirectory,'endpoint.json');
const log=await fs.open(join(directory,'wire.jsonl'),'a',0o600);
let nextConnection=0;const sockets=new Set();
const server=net.createServer(client=>{
  const connection=++nextConnection,upstream=net.createConnection(endpoint.socketPath);
  sockets.add(client);sockets.add(upstream);
  const record=(direction,data)=>writeSync(log.fd,JSON.stringify({time:new Date().toISOString(),connection,direction,...data})+'\n');
  record('transport',{event:'client-connected'});
  upstream.on('connect',()=>record('transport',{event:'upstream-connected'}));
  client.on('end',()=>record('transport',{event:'client-end'}));
  upstream.on('end',()=>record('transport',{event:'upstream-end'}));
  client.on('data',createWireObserver(data=>record('to-host',data)));
  upstream.on('data',createWireObserver(data=>record('from-host',data)));
  client.pipe(upstream);upstream.pipe(client);
  client.on('error',()=>{record('transport',{event:'client-error'});upstream.destroy();});
  upstream.on('error',()=>{record('transport',{event:'upstream-error'});client.destroy();});
  client.on('close',hadError=>{record('transport',{event:'client-close',hadError});sockets.delete(client);upstream.destroy();});
  upstream.on('close',hadError=>{record('transport',{event:'upstream-close',hadError});sockets.delete(upstream);client.destroy();});
});
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,resolve);});
  await fs.chmod(socketPath,0o600);
  await fs.writeFile(proxyDescriptor,JSON.stringify({...endpoint,socketPath}),{mode:0o600});
  console.error(`Local wire metadata: ${join(directory,'wire.jsonl')}`);
  const child=spawn(process.execPath,[join(project,'scripts/run-deepseek.mjs'),...process.argv.slice(2)],{
    cwd:project,env:{...process.env,CORE_CUA_ENDPOINT_FILES:JSON.stringify([proxyDescriptor])},stdio:'inherit'});
  const interrupt=()=>child.kill('SIGINT'),terminate=()=>child.kill('SIGTERM');
  process.on('SIGINT',interrupt);process.on('SIGTERM',terminate);
  try{process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code)=>resolve(code??1));});}
  finally{process.off('SIGINT',interrupt);process.off('SIGTERM',terminate);}
}finally{
  const closed=[...sockets].map(socket=>new Promise(resolve=>{socket.once('close',resolve);socket.destroy();}));
  await Promise.all(closed);
  if(server.listening)await new Promise(resolve=>server.close(resolve));
  await log.close();await fs.rm(socketDirectory,{recursive:true,force:true});
}

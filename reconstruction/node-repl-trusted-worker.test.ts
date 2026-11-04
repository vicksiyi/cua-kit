import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import os from 'node:os';
import { extractNodeReplSources } from '../scripts/extract-node-repl-sources.mjs';
const { files } = await extractNodeReplSources(process.env.CUA_NODE_REPL_BINARY);
async function variants(run: (send: (message: any) => Promise<any>, root: string) => Promise<any>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cua-trusted-'));
  const original = path.join(root, 'original');
  const services = path.join(root, 'services');
  await mkdir(original); await mkdir(services);
  await writeFile(path.join(original, 'package.json'), '{"type":"commonjs"}');
  for (const name of ['trusted-worker.js', 'worker-runtime.js', 'realmChecks.js', 'privileged-node-repl.js', 'privileged-node-repl-config.js', 'tracing.js']) await writeFile(path.join(original, name), files[name]);
  await writeFile(path.join(services, 'service.mjs'), `
let count = 0;
nodeRepl.addAfterSubmittedCodeHook({timeoutMs:1000,run(){ nodeRepl.write('after'); }});
nodeRepl.addTurnEndedHandler({timeoutMs:1000,run(event){ if(!Object.isFrozen(event)) throw Error('unfrozen'); }});
export function classifyError(e){ if(e.message==='classification-fails') throw Error('ignored'); return 'service_error'; }
export async function handleRpc(request){
 count++;
 if(request.op==='fail') throw new Error(request.message);
 if(request.op==='import') return await import(request.url);
 if(request.op==='image') { await nodeRepl.emitImage('data:image/png;base64,AA=='); return 'image'; }
 if(request.op==='trace') return await nodeRepl.telemetry.withSpan('fixture', {}, async()=> 'traced');
 console.log('service',count); nodeRepl.write('written'); nodeRepl.emitContentItem('item');
 return {count, home:nodeRepl.homeDir, meta:nodeRepl.requestMeta, frozen:Object.isFrozen(nodeRepl), baseFrozen:Object.isFrozen(Object.getPrototypeOf(nodeRepl)), tmp:tmpDir===nodeRepl.tmpDir};
}
`);
  await writeFile(path.join(services, 'invalid.mjs'), 'export const value = 1;');
  await writeFile(path.join(root, 'outside.mjs'), 'throw Error("outside code executed");');
  await symlink(path.join(root, 'outside.mjs'), path.join(services, 'escape.mjs'));
  const packageRoot = path.join(services, 'node_modules', 'fixture-service');
  await mkdir(packageRoot, {recursive:true});
  await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({name:'fixture-service',type:'module',exports:'./index.js'}));
  await writeFile(path.join(packageRoot, 'dependency.js'), 'export const value = 17;');
  await writeFile(path.join(packageRoot, 'index.js'), "import {value} from './dependency.js'; import path from 'node:path'; export function handleRpc(){ return {value, builtin:typeof path.join}; }");
  const outputs = [];
  try {
    for (const entry of [path.join(original, 'trusted-worker.js'), path.resolve('packages/node-repl/dist/trusted_worker.js')]) {
      const child = spawn(process.execPath, [entry, root], { env: {
        NODE_REPL_TRUSTED_SERVICES: JSON.stringify({ fixture:path.join(services,'service.mjs'), invalid:path.join(services,'invalid.mjs'), package:'not-configured-package', packaged:'fixture-service' }),
        NODE_REPL_TRUSTED_CODE_PATHS: services,
        NODE_REPL_NODE_MODULE_DIRS: services,
      }, stdio:['pipe','pipe','pipe'] });
      let stderr = '', buffer = ''; const records: any[] = [];
      const pending = new Map<unknown, { resolve: (value:any)=>void; reject:(error:Error)=>void }>();
      child.stderr.on('data', chunk => stderr += chunk);
      child.stdout.on('data', chunk => {
        buffer += chunk;
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const message = JSON.parse(buffer.slice(0,newline)); buffer = buffer.slice(newline+1);
          if(message.type==='emit_image') { child.stdin.write(JSON.stringify({id:message.id,ok:true})+'\n'); continue; }
          records.push(message);
          if(message.type==='trusted_service_response' || message.type==='turn_ended_result') {
            pending.get(message.id)?.resolve(message); pending.delete(message.id);
          }
        }
      });
      child.on('exit', code => { for(const item of pending.values()) item.reject(Error('worker exit '+code+' '+stderr)); pending.clear(); });
      const timer = setTimeout(()=>child.kill(), 15000);
      const send = (message:any) => new Promise<any>((resolve,reject)=>{ pending.set(message.id,{resolve,reject}); child.stdin.write(JSON.stringify(message)+'\n'); });
      try {
        const value = await run(send, services);
        outputs.push({value, records: JSON.parse(JSON.stringify(records), (key,value)=> ['started_at_ms','start_ms','duration_ms'].includes(key)?0:value)});
      } finally {
        clearTimeout(timer);
        const exited = once(child,'exit'); child.stdin.end(); await exited;
      }
    }
    assert.deepEqual(outputs[1],outputs[0]);
    return outputs[1];
  } finally { await rm(root,{recursive:true,force:true}); }
}
test('trusted worker connects service cache, context, output, media, hooks and trace export', async()=>{
  const out=await variants(async send=>{
    const first=await send({type:'service',id:'one',exec_id:'exec',service:'fixture',request:{op:'read'},request_meta:{sample:1}});
    const second=await send({type:'service',id:'two',exec_id:'exec',service:'fixture',request:{op:'read'}});
    const image=await send({type:'service',id:'image',exec_id:'exec',service:'fixture',request:{op:'image'}});
    const trace=await send({type:'service',id:'trace',exec_id:'exec',service:'fixture',request:{op:'trace'},request_meta:{traceparent:''}});
    const hooks=await send({type:'run_hooks',id:'hooks',exec_id:'exec'});
    const end=await send({type:'turn_ended',id:'end',event:{reason:'done'}});
    return {first,second,image,trace,hooks,end};
  });
  assert.equal(out.value.first.value.home,null);
  assert.equal(out.value.second.value.count,2);
  assert.deepEqual(out.value.first.content_items,['item']);
  assert.equal(out.value.first.output.length,2);
  assert.equal(out.value.hooks.output[0].text,'after');
  assert.ok(out.records.some((record:any)=>record.type==='response_meta_trace' && record.trace.spans[0].name==='fixture'));
});
test('trusted worker rejects unconfigured services and symlink escapes and retains error classification',async()=>{
  const out=await variants(async(send,root)=>{
    const values=[]; let id=0;
    for(const [service,request] of [
      ['missing',{}],['invalid',{}],['invalid',{}],['package',{}],
      ['fixture',{op:'fail',message:'failure'}],['fixture',{op:'fail',message:'classification-fails'}],
      ['fixture',{op:'import',url:path.join(root,'escape.mjs')}],
    ]) values.push(await send({type:'service',id:String(++id),service,request}));
    return values;
  });
  assert.ok(out.value.every((value:any)=>value.ok===false));
  assert.equal(out.value[4].error_kind,'service_error');
  assert.equal(out.value[5].error,'classification-fails');
  assert.equal(out.value[5].error_kind,'unknown');
  assert.match(out.value[6].error,/configured trusted code path/);
});

test('trusted worker resolves configured packages and their contained dependencies', async()=>{
  const out=await variants(async send=>send({type:'service',id:'pkg',service:'packaged',request:{}}));
  assert.equal(out.value.ok,true);
  assert.deepEqual(out.value.value,{value:17,builtin:'function'});
});

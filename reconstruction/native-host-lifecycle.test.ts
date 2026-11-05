import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,stat,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import {createLifecycleLog} from '../packages/native-host/src/lifecycle_log';
import {startNativeHost} from '../packages/native-host/src/server';
test('local lifecycle log is private, bounded, metadata-only and rejects symlinks',async t=>{
  const root=await mkdtemp(join(tmpdir(),'cua-life-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const path=join(root,'lifecycle.jsonl');
  const log=createLifecycleLog(path);log.record('starting');log.close();log.close();
  assert.equal((await stat(path)).mode&0o777,0o600);
  const row=JSON.parse((await readFile(path,'utf8')).trim());
  assert.deepEqual(Object.keys(row).sort(),['event','pid','time']);
  await writeFile(path,'x'.repeat(1024*1024));
  const next=createLifecycleLog(path);next.record('ready');next.close();
  assert.ok((await stat(path)).size<200);
  await symlink(path,join(root,'link'));
  assert.throws(()=>createLifecycleLog(join(root,'link')));
});
test('host records actual transport close reasons once without input payload',async()=>{
  for(const reason of ['input-ended','invalid-extension-message'] as const){
    const input=new PassThrough(),output=new PassThrough(),events:string[]=[];
    const host=await startNativeHost(input,output,{onLifecycle:e=>events.push(e)});
    if(reason==='input-ended') input.end();
    else input.write(Buffer.from([1,0,0,0,0xff]));
    await new Promise(resolve=>setImmediate(resolve));
    await host.close();
    assert.deepEqual(events,['ready',reason]);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
const helper = resolve('native/macos/.build/debug/cua-helper');
const skip = process.platform !== 'darwin' || !existsSync(helper);
async function fixture(t: any) {
  const child = spawn(helper,[],{env:{PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8'},stdio:'pipe'});
  const exited = once(child,'exit');
  let output = ''; let stderr = '';
  child.stdout.on('data',part=>output+=part);
  child.stderr.on('data',part=>stderr+=part);
  child.stdin.on('error',()=>{});
  t.after(async()=>{if(child.exitCode===null && child.signalCode===null)child.kill('SIGKILL');await exited;});
  child.stdin.write('{"id":"ready","method":"hello"}\n');
  for(let n=0;!output.includes('\n');n++) {
    assert.ok(n<200 && child.exitCode===null,stderr);
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(JSON.parse(output.split('\n')[0]!).result.protocolVersion,1);
  return {child,exited,output:()=>output};
}
for(const signal of ['SIGTERM','SIGINT'] as const) {
  for(const fragment of ['', '{"id":"partial"']) {
    test(`native stdio ${signal} cancels ${fragment?'partial line':'idle read'} without forced termination`,{skip,timeout:5000},async t=>{
      const {child,exited}=await fixture(t);
      if(fragment)child.stdin.write(fragment);
      child.kill(signal);
      assert.deepEqual(await exited,[0,null]);
    });
  }
}
test('native stdio processes fragmented and final non-newline requests', {skip,timeout:5000}, async t=>{
  const {child,exited,output}=await fixture(t);
  child.stdin.write('{"id":"split",');
  child.stdin.write('"method":"hello"}\n{"id":"final","method":"hello"}');
  child.stdin.end();
  assert.deepEqual(await exited,[0,null]);
  assert.deepEqual(output().trim().split('\n').map(line=>JSON.parse(line).id),['ready','split','final']);
});
test('native stdio bounds an unterminated request before JSON parsing', {skip,timeout:5000}, async t=>{
  const {child,exited}=await fixture(t);
  child.stdin.write('x'.repeat(1024*1024+8192));
  assert.deepEqual(await exited,[1,null]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

test('CLI routes deployment flags independently of surface/check flag order',async t=>{
 const root=await mkdtemp('/tmp/cua-cli-routing-');t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(join(root,'npm'),'#!/bin/sh\necho BUILD_FIXTURE\n',{mode:0o700});
 await writeFile(join(root,'node'),`#!${process.execPath}\nconsole.log(JSON.stringify({argv:process.argv.slice(2),startChrome:process.env.CUA_DEMO_START_CHROME,endpoint:process.env.CUA_CDP_ENDPOINT}));\n`,{mode:0o700});
 const run=(args:string[])=>spawnSync('/bin/bash',[resolve('scripts/run-deepseek.sh'),...args],{encoding:'utf8',timeout:5000,env:{PATH:root+':/usr/bin:/bin',HOME:process.env.HOME,DEEPSEEK_API_KEY:'fixture-not-a-secret',CUA_DEMO_START_CHROME:'1'}});
 for(const args of [
  ['--cdp-browser','--browser','prompt'],['--browser','--cdp-browser','prompt'],
  ['--cdp-browser','--check-browser'],['--check-browser','--cdp-browser'],
  ['--browser','--cdp-endpoint','ws://127.0.0.1:9222/devtools/browser/test','prompt'],
 ]){
  const result=run(args);assert.equal(result.status,0,result.stderr);
  const value=JSON.parse(result.stdout.trim().split('\n').at(-1)!);
  assert.equal(value.argv[2],'packages/agent-loop/src/cdp-demo.ts');
  assert.equal(value.startChrome,undefined);
  assert.ok(!value.argv.slice(3).includes('--cdp-browser'));
 }
 for(const args of [
  ['--cdp-browser','--managed-browser','prompt'],['--managed-browser','--cdp-browser','prompt'],
  ['--browser','--computer','prompt'],['--computer','--cdp-browser','prompt'],
  ['--cdp-endpoint'],['--unknown','prompt'],['--check-browser','prompt'],
 ]){
  const result=run(args);assert.equal(result.status,2,JSON.stringify({args,...result}));
  assert.ok(!result.stdout.includes('BUILD_FIXTURE'));
 }
 const normal=JSON.parse(run(['prompt']).stdout.trim().split('\n').at(-1)!);
 assert.equal(normal.argv[2],'packages/agent-loop/src/restored-demo.ts');assert.equal(normal.startChrome,'1');
 const check=JSON.parse(run(['--check-browser']).stdout.trim().split('\n').at(-1)!);
 assert.equal(check.startChrome,undefined);
 const literal=JSON.parse(run(['--','--literal prompt']).stdout.trim().split('\n').at(-1)!);
 assert.equal(literal.argv[3],'--literal prompt');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NativeHelper } from '../src/native/helper.js';
import { CuaError } from '../src/core/errors.js';

test('native transport retires timed-out writers with an uncertain outcome', {skip:process.platform==='win32'}, async () => {
  const dir = await mkdtemp(join(tmpdir(),'cua-helper-stall-'));
  const path = join(dir,'helper');
  await writeFile(path,`#!${process.execPath}\nconst rl=require('node:readline').createInterface({input:process.stdin});rl.on('line',line=>{const r=JSON.parse(line);if(r.method==='hello')process.stdout.write(JSON.stringify({id:r.id,result:{protocolVersion:1,platform:'macos',capabilities:[],permissions:{accessibility:false,screenRecording:false}}})+'\\n');});\n`,{mode:0o700});
  try {
    for (const method of ['action','keyboardInput','pasteInput','pasteFormatted','pasteWithClipboard','clipboardBegin','clipboardRestore']) {
      const {helper} = await NativeHelper.connect(path);
      try {
        await assert.rejects(helper.request(method,{},25),(e:unknown)=>e instanceof CuaError && e.code==='ACTION_OUTCOME_UNKNOWN');
        await assert.rejects(helper.request('hello'),(e:unknown)=>e instanceof CuaError && e.code==='PROVIDER_DISCONNECTED');
      } finally { await helper.close(); }
    }
  } finally { await rm(dir,{recursive:true,force:true}); }
});

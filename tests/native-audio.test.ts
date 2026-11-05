import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
const helper = resolve('native/macos/.build/debug/cua-helper');
test('native synthetic audio encodes private bounded 24 kHz stereo WAV without capture', {
  skip:process.platform !== 'darwin' || !existsSync(helper),timeout:10000,
}, async () => {
  const {stdout} = await promisify(execFile)(helper,['--audio-writer-self-test'],{env:{PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8'}});
  assert.deepEqual(JSON.parse(stdout),{syntheticWav:true,sampleRate:24000,channels:2});
});

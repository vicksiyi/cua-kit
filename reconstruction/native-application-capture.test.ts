import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

test('native application capture includes an owned offscreen window', {
  skip: process.platform !== 'darwin' || process.env.CUA_TEST_APP_CAPTURE !== '1', timeout: 30000,
}, async t => {
  const root = await mkdtemp('/tmp/cua-app-capture-');
  t.after(() => rm(root, { recursive: true, force: true }));
  const binary = join(root, 'capture-check');
  execFileSync('swiftc', ['-o', binary,
    'native/macos/Sources/CuaHelper/ApplicationCaptureContent.swift',
    'reconstruction/application-capture-content-check.swift'].map(value => value.endsWith('.swift') ? resolve(value) : value));
  const result = spawnSync(binary, [], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /PASS: owned offscreen window/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { MacProvider } from '../src/native/provider.js';
import { CuaError } from '../src/core/errors.js';

const helperPath = resolve('native/macos/.build/debug/cua-helper');
test('native helper: protocol handshake, discovery, policy, binding and permission boundary', { skip: process.platform !== 'darwin' || !existsSync(helperPath) }, async t => {
  const provider = await MacProvider.connect({ helperPath, authorize: () => true });
  try {
    assert.equal(provider.capabilities.protocolVersion, 1);
    const apps = await provider.listApps();
    assert.ok(apps.length > 0);
    const app = await provider.getApp({ pid: apps[0]!.pid });
    assert.equal(app.info.pid, apps[0]!.pid);
    if (!provider.capabilities.permissions.accessibility) {
      await assert.rejects(app.observe(), (e: unknown) => e instanceof CuaError && e.code === 'PERMISSION_DENIED');
      t.diagnostic('Accessibility permission absent: verified explicit denial; real AX/action execution NOT verified.');
    } else {
      const state = await app.observe(); assert.ok(state.elements.length > 0);
      // Read-only existing app inspection. Action tests use the dedicated fixture, never arbitrary user apps.
    }
    await app.release();
    await assert.rejects(app.observe(), (e: unknown) => e instanceof CuaError && e.code === 'TARGET_NOT_FOUND');
    await assert.rejects(provider.getApp({ pid: -1 }), (e: unknown) => e instanceof CuaError && e.code === 'TARGET_NOT_FOUND');
  } finally { await provider.close(); }
  const denied = await MacProvider.connect({ helperPath, authorize: () => false });
  try { assert.deepEqual(await denied.listApps(), []); }
  finally { await denied.close(); }
});

test('native fixture AX actions and stale snapshot rejection', { skip: process.env.CUA_TEST_NATIVE_ACTIONS !== '1' }, async () => {
  const { spawn } = await import('node:child_process');
  const { createInterface } = await import('node:readline');
  const provider = await MacProvider.connect({ helperPath, authorize: () => true });
  // Explicit opt-in must fail, not silently skip, if the machine cannot perform AX actions.
  if (!provider.capabilities.permissions.accessibility) {
    await provider.close();
    assert.fail('Grant Accessibility to the responsible terminal/agent host before running this gate.');
  }
  const child = spawn(resolve('native/macos/.build/debug/CuaFixture'), [], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Fixture startup timed out')), 10000);
      const lines = createInterface({ input: child.stdout });
      lines.on('line', line => { if (line === 'READY') { clearTimeout(timer); lines.close(); resolve(); } });
      child.on('error', error => { clearTimeout(timer); reject(error); });
    });
    const app = await provider.getApp({ pid: child.pid! });
    let state = await app.observe();
    const field = state.elements.find(element => element.role === 'AXTextField')!;
    assert.ok(field);
    const old = app.ref(field.id);
    await app.setValue(old, 'Alice');
    await assert.rejects(app.setValue(old, 'Bob'), (e: unknown) => e instanceof CuaError && e.code === 'STALE_OBSERVATION');
    state = await app.observe();
    const button = state.elements.find(element => element.name === 'Save fixture')!;
    assert.ok(button); await app.click(button.id);
    assert.match(await app.getAXState(), /Saved Alice/);
    await app.release();
  } finally { child.kill(); await provider.close(); }
});

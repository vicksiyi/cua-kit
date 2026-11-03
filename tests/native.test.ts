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
    if (!provider.capabilities.permissions.screenRecording) {
      await assert.rejects(app.listWindows(), (e: unknown) => e instanceof CuaError && e.code === 'PERMISSION_DENIED');
      await assert.rejects(app.captureScreenshot(), (e: unknown) => e instanceof CuaError && e.code === 'PERMISSION_DENIED');
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
    state = await app.observe();
    const editor = state.elements.find(element => element.role === 'AXTextField')!;
    await app.performSecondaryAction(editor.id, 'focus');
    state = await app.observe();
    const focusedEditor = state.elements.find(element => element.role === 'AXTextField')!;
    await app.selectText(focusedEditor.id, 'Alice');
    await app.observe();
    const typed = await app.typeText('你好 🌍'); assert.equal(typed.outcome, 'dispatched');
    const waitForText = async (text: RegExp) => {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) { const observed = await app.observe(); if (text.test(observed.text)) return observed; await new Promise(resolve => setTimeout(resolve,50)); }
      assert.fail('Native app did not reflect dispatched input.');
    };
    await waitForText(/你好 🌍/);
    await app.pressKey('super+a'); await app.observe();
    await app.typeText('Keyboard replaced'); await waitForText(/Keyboard replaced/);
    state = await app.observe();
    await app.selectText(state.elements.find(element => element.role === 'AXTextField')!.id,'Keyboard replaced');
    await app.observe();
    const pasted = await app.paste('Native paste 中文 🌍');
    assert.deepEqual(pasted,{outcome:'observed',verification:'AXValue',clipboardRestored:true});
    await waitForText(/Native paste 中文 🌍/);
    if (process.env.CUA_TEST_NATIVE_SCREENSHOT === '1') {
      assert.equal(provider.capabilities.permissions.screenRecording, true, 'Screen Recording permission required.');
      const windows = await app.listWindows();
      const window = windows.find(window => window.title === 'Cua Kit native fixture');
      assert.ok(window);
      const capture = await app.captureScreenshot({ windowId: window.id });
      assert.equal(Buffer.from(capture.bytes).subarray(0,8).toString('hex'), '89504e470d0a1a0a');
      assert.ok(capture.pixelWidth > 0 && capture.pixelHeight > 0);
      assert.equal(capture.windowId, window.id);
      assert.equal(capture.coordinateSpace, 'window-image-pixels');
      const combined = await app.observe({ screenshot: true, windowId: window.id });
      assert.match(combined.text, /Saved Alice/); assert.ok(combined.screenshot);
    }
    await app.release();
  } finally { child.kill(); await provider.close(); }
});


test('native input encoding checks run without TCC permissions', { skip: process.platform !== 'darwin' || !existsSync(helperPath) }, async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const result = await promisify(execFile)(helperPath, ['--self-test']);
  assert.deepEqual(JSON.parse(result.stdout), { unicodeBoundaries:true, keyChordFlags:true });
});


test('native paste selection verifier handles UTF-16 and invalid ranges without input', { skip: process.platform !== 'darwin' || !existsSync(helperPath) }, async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const result = await promisify(execFile)(helperPath, ['--paste-self-test']);
  assert.deepEqual(JSON.parse(result.stdout),{selectionReplacement:true});
});

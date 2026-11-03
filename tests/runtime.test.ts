import test from 'node:test';
import assert from 'node:assert/strict';
import { createCua } from '../src/index.js';
import { JavascriptSession } from '../src/runtime/javascript.js';

test('persistent isolated JS executes real browser capabilities and recovers after errors', async () => {
  const runtime = await JavascriptSession.create(await createCua({ authorize: () => true }));
  try {
    assert.equal((await runtime.execute('let value = 41; value + 1')).value, 42);
    assert.equal((await runtime.execute('value += 1')).value, 42);
    assert.equal((await runtime.execute('typeof process + ":" + typeof require + ":" + typeof fetch')).value, 'undefined:undefined:undefined');
    await runtime.execute('let tab = await cua.createBrowserTab("chromium");');
    const result = await runtime.execute('await tab.getAXStateAndScreenshot()');
    assert.ok(result.output.some(item => item.type === 'image' && item.data.startsWith('iVBOR')));
    await assert.rejects(runtime.execute('throw new Error("fixture")'));
    assert.equal((await runtime.execute('value')).value, 42);
    await assert.rejects(runtime.execute('while(true) {}', 30));
    await runtime.reset();
    assert.equal((await runtime.execute('typeof value')).value, 'undefined');
  } finally { await runtime.close(); }
});

test('cell drains unawaited host work and timeout cannot create tabs after reset', async () => {
  let release: (() => void) | undefined;
  let gated = false;
  const cua = await createCua({ authorize: async request => {
    if (gated && request.operation === 'createBrowserTab') await new Promise<void>(resolve => { release = resolve; });
    return true;
  } });
  const runtime = await JavascriptSession.create(cua);
  try {
    const result = await runtime.execute('cua.createBrowserTab("chromium").then(t => console.log("created")); "root returned"');
    assert.ok(result.output.some(item => item.type === 'text' && item.text.includes('created')));
    assert.equal((await cua.listTabs()).length, 1);
    gated = true;
    await assert.rejects(runtime.execute('await cua.createBrowserTab("chromium")', 30));
    assert.ok(release, 'host operation was waiting for policy');
    await runtime.reset();
    release!();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal((await cua.listTabs()).length, 1, 'retired authorization must not create a late page');
    const clean = await runtime.execute('console.log("fresh"); 7');
    assert.deepEqual(clean.output, [{ type: 'text', text: 'fresh' }]);
    assert.equal(clean.value, 7);
  } finally { release?.(); await runtime.close(); }
});

test('external cancellation and reset interrupt pending cells without closing the browser', async () => {
  const cua = await createCua({ authorize: () => true });
  const runtime = await JavascriptSession.create(cua);
  try {
    const abort = new AbortController();
    const execution = runtime.execute('await new Promise(() => {})', 20000, { signal: abort.signal });
    const rejected = assert.rejects(execution);
    setTimeout(() => abort.abort(), 20); await rejected;
    await assert.rejects(runtime.execute('1'), /reset/i);
    await runtime.reset();
    const waiting = runtime.execute('await new Promise(() => {})', 20000);
    const stopped = assert.rejects(waiting);
    await new Promise(resolve => setTimeout(resolve, 20));
    await runtime.reset(); await stopped;
    assert.equal((await runtime.execute('42')).value, 42);
  } finally { await runtime.close(); }
});

test('runtime quotas reject oversized source and reset cannot revive a closed VM', async () => {
  const runtime = await JavascriptSession.create(await createCua({ authorize: () => true }));
  try {
    await assert.rejects(runtime.execute(' '.repeat(100001)), /100000/);
    await assert.rejects(runtime.execute('console.log("界".repeat(3000000))'), /budget/i);
    assert.equal((await runtime.execute('123')).value, 123);
  } finally { await runtime.close(); }
  await assert.rejects(runtime.reset(), /ended/);
  await assert.rejects(runtime.execute('1'), /ended/);
});

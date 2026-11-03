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

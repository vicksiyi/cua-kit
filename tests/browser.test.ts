import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createCua, CuaError } from '../src/index.js';

const page = `<!doctype html><html><head><title>Cua fixture</title></head><body>
<label>Name <input id="name"></label><button id="save" onclick="document.querySelector('#result').textContent='Saved '+document.querySelector('#name').value">Save</button>
<p id="result">Not saved</p><a href="/next">Next</a>
<button onclick="document.querySelector('#late').textContent='Changed'">Change DOM</button><p id="late">Initial</p>
<iframe title="child" src="/frame"></iframe>
</body></html>`;

test('real browser: AX IDs, input, click, screenshot, URL binding, stale state and lifecycle', async () => {
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(request.url === '/frame' ? '<button onclick="this.textContent=\'Child clicked\'">Child button</button>' : page);
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const url = `http://127.0.0.1:${port}/`;
  const audit: unknown[] = [];
  const cua = await createCua({ authorize: () => true, audit: entry => audit.push(entry) });
  try {
    const tab = await cua.createBrowserTab('chromium', url);
    let state = await tab.observe({ screenshot: true });
    assert.ok(state.elements.some(node => node.role === 'button' && node.name === 'Save'));
    assert.equal(Buffer.from(state.screenshot!.bytes).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const input = state.elements.find(node => node.role === 'textbox')!;
    const oldRef = tab.ref(input.id);
    await tab.typeText(input.id, 'Alice');
    await assert.rejects(tab.click(oldRef), (e: unknown) => e instanceof CuaError && e.code === 'STALE_OBSERVATION');
    state = await tab.observe();
    const save = state.elements.find(node => node.role === 'button' && node.name === 'Save')!;
    await tab.click(save.id);
    state = await tab.observe();
    assert.match(state.text, /Saved Alice/);
    const same = await cua.getTab({ url }, { browser: 'chromium' });
    assert.equal(same.id, tab.id);
    await assert.rejects(cua.getTab({ url }), (e: unknown) => e instanceof CuaError && e.code === 'INVALID_ARGUMENT');
    await cua.createBrowserTab('chromium', url);
    await assert.rejects(cua.getTab({ url }, { browser: 'chromium' }), (e: unknown) => e instanceof CuaError && e.code === 'AMBIGUOUS_TARGET');
    state = await tab.observe();
    const child = state.elements.find(node => node.name === 'Child button' && node.role === 'button')!;
    assert.ok(child, 'collects iframe accessibility nodes');
    await tab.click(child.id);
    assert.match(await tab.getAXState(), /Child clicked/);
    const abort = new AbortController(); abort.abort();
    await assert.rejects(tab.observe({ signal: abort.signal }), (e: unknown) => e instanceof CuaError && e.code === 'CANCELLED');
    assert.ok(audit.length > 5);
    await cua.reset();
    await assert.rejects(tab.observe(), (e: unknown) => e instanceof CuaError && e.code === 'TARGET_NOT_FOUND');
    const rebound = await cua.getTab(tab.id);
    assert.match(await rebound.getAXState(), /Saved Alice/);
  } finally { await cua.endSession(); server.close(); }
});

test('policy denies writes and session handles cannot cross instances', async () => {
  let allow = true;
  const a = await createCua({ authorize: request => request.effect === 'read' || allow });
  const b = await createCua({ authorize: () => true });
  try {
    const tab = await a.createBrowserTab('chromium');
    await assert.rejects(b.getTab(tab.id), (e: unknown) => e instanceof CuaError && e.code === 'TARGET_NOT_FOUND');
    allow = false;
    await assert.rejects(tab.goto('https://example.com'), (e: unknown) => e instanceof CuaError && e.code === 'PERMISSION_DENIED');
    assert.equal(tab.url, 'about:blank');
    await a.endSession();
    await assert.rejects(tab.observe(), (e: unknown) => e instanceof CuaError && e.code === 'SESSION_CLOSED');
  } finally { await a.endSession(); await b.endSession(); }
});

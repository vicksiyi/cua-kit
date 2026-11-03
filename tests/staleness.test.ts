import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once, EventEmitter } from 'node:events';
import { createCua, CuaError } from '../src/index.js';

test('browser rejects DOM/property/pixel drift and cancels held input with mouse release', async () => {
  const events = new EventEmitter(); let stream: import('node:http').ServerResponse | undefined;
  const server = createServer((request, response) => {
    if (request.url === '/events') { response.writeHead(200, { 'Content-Type': 'text/event-stream' }); response.write(': ready\n\n'); stream = response; events.emit('connected'); return; }
    if (request.url === '/ack' || request.url === '/down') { events.emit(request.url); response.end('ok'); return; }
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><input aria-label="Name"><button id="act" onpointerdown="fetch('/down')" onclick="document.querySelector('p').textContent='clicked'">Act</button><p>initial</p><canvas width="80" height="80"></canvas>
    <script>new EventSource('/events').onmessage = async e => { Function(e.data)(); await fetch('/ack'); };</script>`);
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const cua = await createCua({ authorize: () => true });
  const send = async (code: string) => { const ack = once(events, '/ack'); stream!.write(`data: ${code}\n\n`); await ack; };
  const stale = (error: unknown) => error instanceof CuaError && error.code === 'STALE_OBSERVATION';
  try {
    const tab = await cua.createBrowserTab('chromium', `http://127.0.0.1:${(server.address() as any).port}`);
    if (!stream) await once(events, 'connected');
    let state = await tab.observe();
    let button = state.elements.find(e => e.role === 'button')!;
    await send("document.querySelector('p').textContent='changed externally'");
    await assert.rejects(tab.click(button.id), stale);
    state = await tab.observe(); button = state.elements.find(e => e.role === 'button')!;
    await send("document.querySelector('input').value='property-only'");
    await assert.rejects(tab.click(button.id), stale);
    await send("const host=document.createElement('div'); document.body.append(host); host.attachShadow({mode:'open'}).innerHTML='<input aria-label=shadow>'");
    state = await tab.observe(); button = state.elements.find(e => e.role === 'button')!;
    await send("document.querySelector('div').shadowRoot.querySelector('input').value='shadow property'");
    await assert.rejects(tab.click(button.id), stale);
    await tab.observe({ screenshot: true });
    await send("document.querySelector('canvas').getContext('2d').fillRect(0,0,80,80)");
    await assert.rejects(tab.click([10, 10]), stale);
    state = await tab.observe(); button = state.elements.find(e => e.role === 'button')!;
    const abort = new AbortController();
    const down = once(events, '/down').then(() => abort.abort());
    const started = performance.now();
    await assert.rejects(tab.click(button.id, { durationMs: 5000, signal: abort.signal }), (error: unknown) => error instanceof CuaError && error.code === 'ACTION_OUTCOME_UNKNOWN');
    await down; assert.ok(performance.now() - started < 2000, 'abort releases promptly instead of holding for 5s');
    state = await tab.observe();
    assert.match(state.text, /clicked/, 'release occurred; click can have taken effect despite cancellation');
  } finally { await cua.endSession(); stream?.end(); server.close(); }
});

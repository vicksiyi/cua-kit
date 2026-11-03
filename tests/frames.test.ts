import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createCua, CuaError } from '../src/index.js';

test('cross-site iframe: translated coordinates, nested frames and parent overlay hit test', async () => {
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    if (request.url === '/inner') { response.end('<button onclick="this.textContent=\'OOP clicked\'">OOP button</button>'); return; }
    if (request.url === '/frame') { response.end('<iframe style="margin:25px;border:4px solid" src="/inner"></iframe>'); return; }
    const cover = request.url === '/covered';
    response.end(`<style>iframe { position:absolute;left:200px;top:150px;width:450px;height:250px;border:5px solid;transform:scale(1.2);transform-origin:top left } .cover {position:absolute;left:190px;top:140px;width:560px;height:330px;background:#ddd;z-index:5}</style><iframe src="http://localhost:${port}/frame"></iframe>${cover ? '<div class="cover">Overlay</div>' : ''}`);
  }).listen(0);
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const cua = await createCua({ authorize: () => true });
  try {
    const tab = await cua.createBrowserTab('chromium', `http://127.0.0.1:${port}/`);
    const state = await tab.observe();
    const button = state.elements.find(e => e.name === 'OOP button' && e.role === 'button');
    assert.ok(button, 'cross-site nested AX node collected');
    assert.deepEqual(state.warnings, []);
    await tab.click(button.id);
    assert.match(await tab.getAXState(), /OOP clicked/);
    await tab.goto(`http://127.0.0.1:${port}/covered`);
    const covered = await tab.observe();
    const other = covered.elements.find(e => e.name === 'OOP button' && e.role === 'button');
    assert.ok(other);
    await assert.rejects(tab.click(other.id), (error: unknown) => error instanceof CuaError && error.code === 'ELEMENT_NOT_INTERACTABLE' && error.message.includes('covered'));
    assert.doesNotMatch(await tab.getAXState(), /OOP clicked/);
  } finally { await cua.endSession(); server.close(); }
});

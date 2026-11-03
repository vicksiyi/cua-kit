import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createCua, CuaError } from '../src/index.js';

test('text selection, modifier click, held keys and pointer drag on real page', async () => {
  const server = createServer((_, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><style>#drag{position:absolute;left:20px;top:200px;width:50px;height:50px;background:blue;touch-action:none}</style>
    <input aria-label="Editor" value="alpha beta beta omega"><button onclick="document.querySelector('p').textContent=event.shiftKey?'shift click':'plain click'">Click</button>
    <p>initial</p><div id="drag"></div><output>not dragged</output>
    <script>
    const box=document.querySelector('#drag'); let down=false;
    box.onpointerdown=e=>{down=true;box.setPointerCapture(e.pointerId)};
    box.onpointermove=e=>{if(down){box.style.left=(e.clientX-25)+'px';box.style.top=(e.clientY-25)+'px'}};
    box.onpointerup=e=>{down=false;document.querySelector('output').textContent='dragged '+e.clientX+','+e.clientY};
    </script>`);
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const cua = await createCua({ authorize: () => true });
  try {
    const tab = await cua.createBrowserTab('chromium', `http://127.0.0.1:${(server.address() as any).port}`);
    let state = await tab.observe(); let input = state.elements.find(e => e.role === 'textbox')!;
    await assert.rejects(tab.selectText(input.id, 'beta'), /ambiguous/);
    state = await tab.observe(); input = state.elements.find(e => e.role === 'textbox')!;
    await tab.selectText(input.id, 'beta', { prefix: 'beta ' });
    await tab.typeText(null, 'GAMMA');
    assert.match(await tab.getAXState(), /alpha beta GAMMA omega/);
    state = await tab.observe(); const button = state.elements.find(e => e.role === 'button')!;
    await tab.click(button.id, { key: 'Shift' });
    assert.match(await tab.getAXState(), /shift click/);
    state = await tab.observe(); input = state.elements.find(e => e.role === 'textbox')!;
    await tab.pressKey(input.id, 'End', { durationMs: 30 });
    await tab.pressKey(null, '+');
    assert.match(await tab.getAXState(), /omega\+/);
    await tab.observe({ screenshot: true });
    await tab.drag([45,225], [300,300], { durationMs: 80, steps: 8 });
    assert.match(await tab.getAXState(), /dragged 300,300/);
    await assert.rejects(tab.drag([300,300], [400,300]), (e: unknown) => e instanceof CuaError && e.code === 'STALE_OBSERVATION');
  } finally { await cua.endSession(); server.close(); }
});

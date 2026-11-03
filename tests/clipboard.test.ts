import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createCua } from '../src/index.js';
const helperPath = resolve('native/macos/.build/debug/cua-helper');
const skip = process.platform !== 'darwin' || !existsSync(helperPath);

test('named pasteboard preserves all formats and never overwrites newer copies', {skip}, async () => {
  const result = await promisify(execFile)(helperPath,['--clipboard-self-test']);
  assert.deepEqual(JSON.parse(result.stdout),{clipboardFormats:true,externalCopyPreserved:true});
});

test('real browser clipboard paste delivers trusted text, sanitized HTML and Markdown', {skip}, async () => {
  const server = createServer((_,res) => {
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end(`<!doctype html><textarea aria-label="Plain"></textarea><div contenteditable="true" role="textbox" aria-label="Rich"></div><p id="status">waiting</p>
    <script>document.addEventListener('paste',e=>{document.querySelector('#status').textContent='trusted='+e.isTrusted+';html='+e.clipboardData.types.includes('text/html')});document.querySelector('[contenteditable]').addEventListener('input',e=>{document.querySelector('#status').textContent+=';bold='+!!e.target.querySelector('b,strong')+';script='+!!e.target.querySelector('script')});</script>`);
  }).listen(0,'127.0.0.1');
  await once(server,'listening');
  const cua = await createCua({headless:false,nativeHelperPath:helperPath,authorize:()=>true});
  try {
    const tab = await cua.createBrowserTab('chromium',`http://127.0.0.1:${(server.address() as any).port}`);
    let state = await tab.observe();
    let plain = state.elements.find(e=>e.name==='Plain' && e.role==='textbox')!;
    assert.deepEqual(await tab.paste(plain.id,'中文 🌍'),{eventObserved:true,clipboardRestored:true});
    assert.match(await tab.getAXState(),/中文 🌍/);
    assert.match(await tab.getAXState(),/trusted=true;html=false/);
    state=await tab.observe();
    let rich=state.elements.find(e=>e.name==='Rich' && e.role==='textbox')!;
    await tab.paste(rich.id,'<b>Rich HTML</b><script>evil()</script>',{format:'html'});
    assert.match(await tab.getAXState(),/Rich HTML/);
    assert.match(await tab.getAXState(),/trusted=true;html=true;bold=true;script=false/);
    await tab.selectText((await tab.observe()).elements.find(e=>e.name==='Rich' && e.role==='textbox')!.id,'Rich HTML');
    await tab.paste(null,'**Markdown bold**',{format:'md'});
    assert.match(await tab.getAXState(),/Markdown bold/);
    assert.match(await tab.getAXState(),/trusted=true;html=true;bold=true;script=false/);
  } finally { await cua.endSession(); server.close(); }
});


test('headless managed browser does not advertise the macOS system clipboard', {skip}, async () => {
  const cua = await createCua({nativeHelperPath:helperPath,authorize:()=>true});
  try {
    const tab = await cua.createBrowserTab('chromium');
    assert.equal(tab.capabilities.includes('paste'),false);
    await assert.rejects(tab.paste(null,'not written'),/Configure a clipboard backend/);
  } finally { await cua.endSession(); }
});

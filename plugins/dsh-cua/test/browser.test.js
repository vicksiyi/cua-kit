import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Config, serverParameters } from '../src/config.js';
import { CuaConnection } from '../src/connection.js';

test('DSH stdio session can navigate, type, click and observe its owned Chrome tab', {
  skip: process.platform !== 'darwin' || process.env.CUA_TEST_DSH_BROWSER !== '1',
  timeout: 90000,
}, async () => {
  const query = `input-${randomUUID()}`, marker = `verified-${randomUUID()}`;
  let submitted = false;
  let resolveSubmit;
  const submit = new Promise(resolve => { resolveSubmit = resolve; });
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    if (request.url === '/done') {
      let body = '';
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        const values = new URLSearchParams(body);
        if (request.method !== 'POST' || values.get('query') !== query || values.get('trusted') !== 'true') {
          response.writeHead(400).end('Expected typed input and a trusted browser click');
          return;
        }
        submitted = true;
        response.end(`<title>${marker}</title><h1>${marker}</h1>`);
        resolveSubmit();
      });
      return;
    }
    response.end('<title>DSH browser fixture</title><h1>DSH browser fixture</h1><form action="/done" method="post"><label>Verification code<input name="query"></label><input type="hidden" name="trusted"><button>Verify browser</button></form><script>document.querySelector("button").addEventListener("click",event=>document.querySelector("[name=trusted]").value=String(event.isTrusted))</script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const connection = new CuaConnection(await serverParameters(Config({surfaces:'browser,computer'})), {
    approve: async params => params._meta?.tool_name === 'access_browser_origin' && params._meta?.origin === origin ? 'allowed-once' : 'rejected',
  });
  let created = false;
  const exec = {signal:AbortSignal.timeout(75000)};
  const execute = async code => {
    const result = await connection.call('js', {code}, exec, 1);
    const text = result.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
    assert.notEqual(result.isError, true, text.slice(-1500));
    return {result,text};
  };
  try {
    await execute('await cua.getState();');
    await execute('var dshTestState = await cua.getState({emit:false}); var dshTestBrowser = await cua.getBrowser({id:dshTestState.browsers[0].id});');
    await execute('var dshTestTab = await dshTestBrowser.tabs.new();');
    created = true;
    await execute(`await dshTestTab.goto(${JSON.stringify(origin)});`);
    assert.match((await execute('await dshTestTab.getAXState();')).text, /DSH browser fixture/);
    await execute(`await dshTestTab.playwright.getByRole('textbox',{name:'Verification code'}).fill(${JSON.stringify(query)});`);
    await execute('await dshTestTab.playwright.getByRole("button",{name:"Verify browser",exact:true}).click();');
    await Promise.race([submit, new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('No browser form submission observed')), 10000);
      timer.unref();
    })]);
    assert.equal(submitted, true);
    assert.match((await execute('await dshTestTab.getAXState();')).text, new RegExp(marker));
    const screenshot = await execute('await dshTestTab.getScreenshot();');
    assert.ok(screenshot.result.content.some(item => item.type === 'image'));
  } finally {
    try {
      if (created && !connection.closed) await connection.call('js', {code:'await dshTestTab.close();'}, {signal:AbortSignal.timeout(5000)}, 1);
      await connection.endTurn(1);
    } finally {
      await connection.dispose();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }
});

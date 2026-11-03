import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { AgentLoop } from '../src/agent/loop.js';
import { McpToolClient } from '../src/agent/mcp-client.js';
import { ChatCompletionsModel } from '../src/agent/chat-model.js';

test('question -> HTTP model adapter -> stdio MCP -> QuickJS -> real Chromium -> observed answer', async () => {
  let requests = 0;
  const http = createServer(async (request, response) => {
    if (request.url !== '/model') { response.end('<h1>Fixture catalog</h1><p>Available widgets: 17</p>'); return; }
    let body = ''; for await (const chunk of request) body += chunk;
    const data = JSON.parse(body); requests++;
    assert.ok(data.tools.some((tool: any) => tool.function.name === 'js'));
    assert.equal(request.headers.authorization, 'Bearer fixture-only');
    const toolResults = data.messages.filter((message: any) => message.role === 'tool');
    response.setHeader('Content-Type', 'application/json');
    if (!toolResults.length) {
      assert.ok(data.messages.some((m: any) => m.content === 'How many widgets are available?'));
      response.end(JSON.stringify({ choices: [{ message: { tool_calls: [{ id: 'observe-1', type: 'function', function: { name: 'js', arguments: JSON.stringify({ code: `let tab = await cua.createBrowserTab('chromium', '${url}'); await tab.getAXStateAndScreenshot()` }) } }] } }] }));
    } else {
      assert.match(toolResults[0].content, /Available widgets: 17/);
      assert.ok(data.messages.some((m: any) => Array.isArray(m.content) && m.content.some((part: any) => part.type === 'image_url' && part.image_url.url.startsWith('data:image/png;base64,iVBOR'))));
      response.end(JSON.stringify({ choices: [{ message: { content: 'The observed page lists 17 available widgets.' } }] }));
    }
  }).listen(0, '127.0.0.1');
  await once(http, 'listening');
  const url = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
  const client = await McpToolClient.connect({ command: process.execPath, args: [resolve('dist/mcp/stdio.js')], env: { CUA_ALLOWED_ORIGINS: url }, stderr: 'inherit' });
  try {
    const model = new ChatCompletionsModel({ endpoint: `${url}/model`, apiKey: 'fixture-only', model: 'deterministic-fixture' });
    const result = await new AgentLoop(model, client).run('How many widgets are available?');
    assert.match(result.answer, /17/); assert.equal(requests, 2);
    const denied = await client.callTool({ id: 'denied', name: 'js', arguments: { code: `await tab.goto('https://not-authorized.example')` } });
    assert.equal(denied.isError, true);
    const timeout = await client.callTool({ id: 'timeout', name: 'js', arguments: { code: 'await new Promise(() => {})', timeoutMs: 20 } });
    assert.equal(timeout.isError, true);
    await client.callTool({ id: 'reset', name: 'js_reset', arguments: {} });
    const clean = await client.callTool({ id: 'clean', name: 'js', arguments: { code: 'typeof tab' } });
    assert.equal(clean.isError, false);
    assert.match(JSON.stringify(clean.content), /undefined/);
  } finally { await client.close(); http.close(); }
});

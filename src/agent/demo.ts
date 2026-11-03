import { fileURLToPath } from 'node:url';
import { AgentLoop } from './loop.js';
import { McpToolClient } from './mcp-client.js';
import { ChatCompletionsModel } from './chat-model.js';

const question = process.argv.slice(2).join(' ').trim();
if (!question) throw new Error('Usage: npm run demo -- "Open https://example.com and explain the page"');
const apiKey = process.env.CUA_MODEL_API_KEY, model = process.env.CUA_MODEL;
if (!apiKey || !model) throw new Error('Set CUA_MODEL_API_KEY and CUA_MODEL.');
if (!process.env.CUA_ALLOWED_ORIGINS && !process.env.CUA_ALLOWED_APPS) throw new Error('Set CUA_ALLOWED_ORIGINS to explicitly authorize the demo target origins.');
const client = await McpToolClient.connect({ command: process.execPath,
  args: [fileURLToPath(new URL('../mcp/stdio.js', import.meta.url))],
  // Deliberately do not forward model credentials to the computer-use server.
  env: Object.fromEntries(['CUA_HEADLESS', 'CUA_ALLOWED_ORIGINS', 'CUA_ALLOWED_APPS', 'CUA_NATIVE_HELPER_PATH', 'CUA_EXTENSION_PROFILE'].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : [])), stderr: 'inherit' });
const abort = new AbortController();
process.once('SIGINT', () => abort.abort());
try {
  const result = await new AgentLoop(new ChatCompletionsModel({ apiKey, model,
    endpoint: process.env.CUA_MODEL_ENDPOINT ?? 'https://api.openai.com/v1/chat/completions' }), client)
    .run(question, { signal: abort.signal, onMessage: message => {
      if (message.role === 'assistant' && message.toolCalls) console.error(`Calling ${message.toolCalls.map(call => call.name).join(', ')}`);
    } });
  console.log(result.answer);
} finally { await client.close(); }

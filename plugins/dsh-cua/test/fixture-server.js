import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server({ name: 'cua-fixture', version: '1' }, {
  capabilities: { tools: {} }, instructions: 'Fixture CUA server instructions',
});
const calls = [];
let running = 0;
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [
  { name: 'js', description: 'Fixture JS', inputSchema: { type: 'object' } },
  { name: 'js_reset', inputSchema: { type: 'object' } },
  { name: 'turn_ended', inputSchema: { type: 'object' } },
] }));
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args, _meta } = request.params;
  if (args?.code === 'session-config') return {
    isError: process.env.CUA_MCP_SESSION_ID !== _meta?.['x-codex-turn-metadata']?.session_id,
    content: [{ type: 'text', text: process.env.CUA_MCP_SESSION_ID ?? 'no launch session' }],
  };
  if (args?.code === 'log') return { content: [{ type: 'text', text: JSON.stringify(calls) }] };
  calls.push({ name, args, meta: _meta, overlap: running > 0 });
  running++;
  try {
    if (args?.code === 'wait') await new Promise(resolve => {
      const timer = setTimeout(resolve, 30000);
      extra.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    if (args?.code === 'approve' || args?.code === 'approve-twice') {
      const result = await server.elicitInput({ message: 'Allow https://example.com?', requestedSchema: { type: 'object', properties: {} } });
      if (args.code === 'approve-twice') await server.elicitInput({ message: 'Allow second observation?', requestedSchema: { type: 'object', properties: {} } });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
    if (args?.code === 'policy') return { isError: true, content: [{ type: 'text', text: 'Browser Use rejected this action due to browser security policy. Reason: fixture' }] };
    if (args?.code === 'error') return { isError: true, content: [{ type: 'text', text: 'fixture failure' }] };
    if (args?.code === 'image') return { content: [{ type: 'image', mimeType: 'image/png', data: 'aW1hZ2U=' }] };
    return { content: [{ type: 'text', text: 'ok' }] };
  } finally { running--; }
});
await server.connect(new StdioServerTransport());

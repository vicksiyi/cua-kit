import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createCua } from '../index.js';
import { JavascriptSession } from '../runtime/javascript.js';
import { createMcpServer } from './server.js';

// Host configuration, not model-controlled arguments. No ambient authorization.
const origins = new Set((process.env.CUA_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean));
if (!origins.size) throw new Error('Set CUA_ALLOWED_ORIGINS to comma-separated authorized origins (e.g. http://127.0.0.1:8080).');
const cua = await createCua({ authorize: request => {
  if (request.url === 'about:blank') return true;
  try { return origins.has(new URL(request.url).origin); } catch { return false; }
} });
const runtime = await JavascriptSession.create(cua);
const server = createMcpServer(runtime);
let closed = false;
async function close() { if (closed) return; closed = true; await runtime.close(); }
const report = (error: unknown) => { console.error('CUA cleanup failed:', String(error)); process.exitCode = 1; };
server.server.onclose = () => { void close().catch(report); };
process.stdin.once('end', () => { void server.close().then(close).catch(report); });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void server.close().then(close).catch(report); });
await server.connect(new StdioServerTransport());

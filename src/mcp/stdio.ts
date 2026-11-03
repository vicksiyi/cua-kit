import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createCua } from '../index.js';
import { JavascriptSession } from '../runtime/javascript.js';
import { createMcpServer } from './server.js';

// Host configuration, not model-controlled arguments. No ambient authorization.
const origins = new Set((process.env.CUA_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean));
const apps = new Set((process.env.CUA_ALLOWED_APPS ?? '').split(',').filter(Boolean));
if (!origins.size && !apps.size) throw new Error('Set CUA_ALLOWED_ORIGINS and/or CUA_ALLOWED_APPS to authorize targets.');
const cua = await createCua({ nativeHelperPath: process.env.CUA_NATIVE_HELPER_PATH, authorize: request => {
  if (request.url.startsWith('app://')) return apps.has(decodeURIComponent(request.url.slice(6)));
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

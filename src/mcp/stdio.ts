import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createCua, ExtensionBridge } from '../index.js';
import { JavascriptSession } from '../runtime/javascript.js';
import { createMcpServer } from './server.js';

// Host configuration, not model-controlled arguments. No ambient authorization.
const origins = new Set((process.env.CUA_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean));
const apps = new Set((process.env.CUA_ALLOWED_APPS ?? '').split(',').filter(Boolean));
if (!origins.size && !apps.size) throw new Error('Set CUA_ALLOWED_ORIGINS and/or CUA_ALLOWED_APPS to authorize targets.');
let extensionBridge: ExtensionBridge | undefined;
if (process.env.CUA_EXTENSION_PROFILE) {
  const identity = JSON.parse(await readFile(new URL('../../extensions/chrome/identity.json', import.meta.url), 'utf8'));
  extensionBridge = await ExtensionBridge.listen(identity.extensionId);
  try { await extensionBridge.installHost(process.env.CUA_EXTENSION_PROFILE, fileURLToPath(new URL('../extension/native-host.js', import.meta.url))); }
  catch (error) { await extensionBridge.close(); throw error; }
  console.error('Cua Kit extension bridge installed for this session. Load dist/chrome-extension, then click its action on each intended tab.');
}
const cua = await createCua({ extensionBridge, nativeHelperPath: process.env.CUA_NATIVE_HELPER_PATH, authorize: request => {
  if (request.url.startsWith('app://')) return apps.has(decodeURIComponent(request.url.slice(6)));
  if (request.url === 'about:blank') return true;
  try { return origins.has(new URL(request.url).origin); } catch { return false; }
} });
const runtime = await JavascriptSession.create(cua);
const server = createMcpServer(runtime);
let closed = false;
async function close() { if (closed) return; closed = true; try { await runtime.close(); } finally { await extensionBridge?.close(); } }
const report = (error: unknown) => { console.error('CUA cleanup failed:', String(error)); process.exitCode = 1; };
server.server.onclose = () => { void close().catch(report); };
process.stdin.once('end', () => { void server.close().then(close).catch(report); });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void server.close().then(close).catch(report); });
await server.connect(new StdioServerTransport());

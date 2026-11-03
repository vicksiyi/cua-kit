import { createServer, type Server, type Socket } from 'node:net';
import { mkdtemp, chmod, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
import { CuaError, type ErrorCode } from '../core/errors.js';

export interface GrantedTab { id: number; url: string; title: string }
/** Local extension transport. Browser consent and host SDK authorization are separate gates. */
export class ExtensionBridge extends EventEmitter {
  private server!: Server;
  private peer?: Socket;
  private pending = new Map<string, { resolve: (value: any) => void; reject: (error: unknown) => void; timer: ReturnType<typeof setTimeout> }>();
  private connections = new Set<Socket>();
  private token = randomBytes(32).toString('hex');
  private ready = false;
  private installed = new Map<string,string>();
  private constructor(readonly directory: string, readonly extensionId: string) { super(); }
  static async listen(extensionId: string): Promise<ExtensionBridge> {
    if (!/^[a-p]{32}$/.test(extensionId)) throw new Error('Invalid Chrome extension ID.');
    const directory = await mkdtemp(join(tmpdir(), 'cua-ext-')); await chmod(directory, 0o700);
    const bridge = new ExtensionBridge(directory, extensionId);
    bridge.server = createServer(socket => bridge.accept(socket));
    await new Promise<void>((resolve, reject) => { bridge.server.once('error', reject); bridge.server.listen(join(directory, 'bridge.sock'), resolve); });
    return bridge;
  }
  private accept(socket: Socket) {
    this.connections.add(socket); let authenticated = false;
    const timer = setTimeout(() => socket.destroy(), 3000);
    const lines = createInterface({ input: socket });
    lines.on('line', line => {
      try {
        if (line.length > 32 * 1024 * 1024) throw new Error('Bridge response too large.');
        const message = JSON.parse(line);
        if (!authenticated) {
          const token = Buffer.from(typeof message.token === 'string' ? message.token : '');
          const expected = Buffer.from(this.token);
          if (this.peer || message.hello !== 1 || message.extensionId !== this.extensionId || token.length !== expected.length || !timingSafeEqual(token, expected)) throw new Error('Bridge authentication failed.');
          clearTimeout(timer); authenticated = true; this.peer = socket; return;
        }
        if (message.event) {
          if (message.event === 'ready') {
            if (message.protocolVersion !== 1 || message.extensionId !== this.extensionId) throw new Error('Incompatible extension.');
            this.ready = true;
          }
          this.emit(message.event, message); return;
        }
        const pending = this.pending.get(message.id); if (!pending) return;
        clearTimeout(pending.timer); this.pending.delete(message.id);
        if (message.error) {
          const messageText = String(message.error.message ?? 'Extension request failed.');
          const code = messageText.match(/\b(PERMISSION_DENIED|TARGET_NOT_FOUND|UNSUPPORTED_CAPABILITY|STALE_OBSERVATION|INVALID_ARGUMENT):/)?.[1] as ErrorCode | undefined;
          pending.reject(new CuaError(code ?? 'PROVIDER_DISCONNECTED', messageText));
        }
        else pending.resolve(message.result);
      } catch { socket.destroy(); }
    });
    socket.on('error', () => {});
    socket.on('close', () => {
      clearTimeout(timer); this.connections.delete(socket);
      if (this.peer !== socket) return;
      this.peer = undefined; this.ready = false;
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new CuaError('PROVIDER_DISCONNECTED', 'Extension disconnected.')); }
      this.pending.clear(); this.emit('disconnected');
    });
  }
  async installHost(profileDirectory: string, nativeHostScript: string): Promise<string> {
    const configPath = join(this.directory, 'connection.json');
    await writeFile(configPath, JSON.stringify({ socketPath: join(this.directory, 'bridge.sock'), token: this.token, extensionId: this.extensionId }), { mode: 0o600 });
    const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
    const launcher = join(this.directory, 'native-host');
    await writeFile(launcher, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(resolve(nativeHostScript))} ${quote(configPath)} "$@"\n`, { mode: 0o700 });
    const manifests = join(profileDirectory, 'NativeMessagingHosts'); await mkdir(manifests, { recursive: true });
    const path = join(manifests, 'com.vicksiyi.cua_kit.json');
    await writeFile(path, JSON.stringify({ name: 'com.vicksiyi.cua_kit', description: 'Cua Kit local extension bridge', path: launcher, type: 'stdio', allowed_origins: [`chrome-extension://${this.extensionId}/`] }), { flag: 'wx', mode: 0o600 });
    this.installed.set(path,launcher); return path;
  }
  waitForReady(timeoutMs = 10000): Promise<void> {
    if (this.ready) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const ready = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => { this.off('ready', ready); reject(new Error('Extension connection timed out. Grant a tab with the extension action.')); }, timeoutMs);
      this.once('ready', ready);
    });
  }
  request<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 15000): Promise<T> {
    if (!this.ready || !this.peer) return Promise.reject(new CuaError('PROVIDER_DISCONNECTED', 'Extension is not connected.'));
    if (this.pending.size >= 64) return Promise.reject(new CuaError('INVALID_ARGUMENT', 'Extension request budget exceeded.'));
    const id = randomUUID(), message = JSON.stringify({ id, method, params });
    if (Buffer.byteLength(message) > 1024 * 1024) return Promise.reject(new CuaError('INVALID_ARGUMENT', 'Extension request too large.'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new CuaError('ACTION_OUTCOME_UNKNOWN', 'Extension request timed out; do not automatically replay.')); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer }); this.peer!.write(message + '\n');
    });
  }
  listTabs(): Promise<GrantedTab[]> { return this.request('listTabs'); }
  async attach(tabId: number): Promise<void> { await this.request('attach', { tabId }); }
  async detach(tabId: number): Promise<void> { await this.request('detach', { tabId }); }
  send<T = any>(tabId: number, method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> { return this.request('cdp', { tabId, method, params, sessionId }); }
  async close(): Promise<void> {
    for (const socket of this.connections) socket.destroy();
    await new Promise<void>(resolve => this.server.close(() => resolve()));
    for (const [path, launcher] of this.installed) {
      try { if (JSON.parse(await readFile(path,'utf8')).path === launcher) await rm(path); } catch { /* absent or replaced registration is not ours to remove */ }
    }
    this.installed.clear();
    await rm(this.directory, { recursive: true, force: true });
  }
}

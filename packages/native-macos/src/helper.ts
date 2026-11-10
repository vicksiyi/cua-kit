// Independently authored; reused from the earlier local native prototype, not vendor source.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { CuaError, type ErrorCode } from './errors';

export interface NativeAppInfo { pid: number; name: string; bundleId: string; path: string; launchTime: number }
export interface HelperHello { protocolVersion: 1; platform: 'macos'; capabilities: string[]; permissions: { accessibility: boolean; screenRecording: boolean } }
export function nativeHelperEnvironment(environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8' };
  const diagnosticPath = environment.CUA_NATIVE_INPUT_LOG;
  if (diagnosticPath?.startsWith('/')) result.CUA_NATIVE_INPUT_LOG = diagnosticPath;
  return result;
}
/** Include declared hold time in the helper deadline; never retire a valid 30-second hold at 15 seconds. */
export function nativeRequestTimeout(method: string, params: Record<string, unknown>): number {
  let holdMs = 0;
  if (method === "keyboardInput" && params.operation === "pressKey" && typeof params.durationMs === "number" && Number.isFinite(params.durationMs) && params.durationMs >= 0 && params.durationMs <= 30000) holdMs = params.durationMs;
  if (method === "mouseInput" && typeof params.duration === "number" && Number.isFinite(params.duration) && params.duration >= 0 && params.duration <= 30) {
    const count = params.clickCount ?? 1;
    if (typeof count === "number" && Number.isSafeInteger(count) && count >= 1 && count <= 10) holdMs = params.duration * 1000 * count;
  }
  return 15000 + Math.ceil(holdMs);
}
/** Owned helper process, versioned NDJSON RPC, bounded pending work, no inherited model secrets. */
export class NativeHelper {
  private child: ChildProcessWithoutNullStreams;
  private pending = new Map<string, { resolve: (value: any) => void; reject: (error: unknown) => void; timer: ReturnType<typeof setTimeout> }>();
  private ended = false;
  private constructor(path: string) {
    this.child = spawn(path, [], { stdio: 'pipe', env: nativeHelperEnvironment() });
    this.child.stderr.resume();
    const lines = createInterface({ input: this.child.stdout });
    lines.on('line', line => {
      try {
        if (line.length > 8 * 1024 * 1024) throw new Error('Oversized helper reply.');
        const response = JSON.parse(line);
        if (typeof response.id !== 'string') throw new Error('Malformed helper reply.');
        const request = this.pending.get(response.id); if (!request) return;
        clearTimeout(request.timer); this.pending.delete(response.id);
        if (response.error) request.reject(new CuaError(response.error.code as ErrorCode, response.error.message));
        else request.resolve(response.result);
      } catch (error) { this.fail(error); this.child.kill(); }
    });
    this.child.on('error', error => this.fail(error));
    this.child.on('exit', () => this.fail(new CuaError('PROVIDER_DISCONNECTED', 'Native helper exited.')));
    this.child.stdin.on('error', error => this.fail(error));
  }
  static async connect(path: string): Promise<{ helper: NativeHelper; hello: HelperHello }> {
    const helper = new NativeHelper(path);
    try {
      const hello = await helper.request<HelperHello>('hello');
      if (hello.protocolVersion !== 1 || hello.platform !== 'macos') throw new CuaError('UNSUPPORTED_CAPABILITY', 'Incompatible native helper protocol.');
      return { helper, hello };
    } catch (error) { await helper.close(); throw error; }
  }
  request<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = nativeRequestTimeout(method, params)): Promise<T> {
    if (this.ended) return Promise.reject(new CuaError('PROVIDER_DISCONNECTED', 'Native helper is closed.'));
    if (this.pending.size >= 32) return Promise.reject(new CuaError('INVALID_ARGUMENT', 'Native request queue full.'));
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CuaError(['action','mouseInput','scrollInput','dragInput','keyboardInput','pasteInput','pasteWithClipboard','clipboardBegin','clipboardRestore'].includes(method) ? 'ACTION_OUTCOME_UNKNOWN' : 'CANCELLED', 'Native operation timed out. Helper retired; reconnect before further operations.'));
        this.fail(new CuaError('PROVIDER_DISCONNECTED', 'Helper retired after timeout.')); this.child.kill();
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }
  private fail(error: unknown): void {
    this.ended = true;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
    this.pending.clear();
  }
  async close(): Promise<void> {
    this.fail(new CuaError('SESSION_CLOSED', 'Native helper closed.'));
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => this.child.kill('SIGKILL'), 15000);
      this.child.once('close', () => { clearTimeout(timer); resolve(); });
      this.child.stdin.end();
    });
  }
}

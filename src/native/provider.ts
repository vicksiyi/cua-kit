import { runClipboardOperation } from '../core/clipboard.js';
import { NativeClipboard } from './clipboard.js';
import { randomUUID } from 'node:crypto';
import { NativeHelper, type NativeAppInfo, type HelperHello } from './helper.js';
import { assert, checkAbort } from '../core/errors.js';
import type { Authorize, AXElement, ElementRef, ActionOptions, SelectTextOptions, PressKeyOptions, PasteOptions } from '../core/types.js';
import { SerialQueue } from '../core/serial.js';

export interface NativeWindow { id: number; title: string; frame: { x: number; y: number; width: number; height: number } }
export interface NativeScreenshot {
  id: string; windowId: number; mimeType: 'image/png'; bytes: Uint8Array;
  pixelWidth: number; pixelHeight: number; pointPixelScale: number;
  coordinateSpace: 'window-image-pixels'; windowFrame: NativeWindow['frame']; contentRect: NativeWindow['frame']; capturedAt: string;
}
type ScreenshotWire = Omit<NativeScreenshot, 'bytes'> & { data: string };
export interface NativeStateOptions extends ActionOptions { screenshot?: boolean; windowId?: number }
function decodeScreenshot(raw: ScreenshotWire): NativeScreenshot {
  assert(raw.mimeType === 'image/png' && raw.coordinateSpace === 'window-image-pixels' && typeof raw.data === 'string', 'PROVIDER_DISCONNECTED', 'Malformed native screenshot.');
  const bytes = Buffer.from(raw.data, 'base64');
  assert(bytes.length <= 5 * 1024 * 1024 && bytes.subarray(0,8).toString('hex') === '89504e470d0a1a0a', 'PROVIDER_DISCONNECTED', 'Invalid native PNG payload.');
  const { data: _, ...metadata } = raw; return { ...metadata, bytes: new Uint8Array(bytes) };
}
export interface NativeObservation {
  sessionId: string; targetId: string; snapshotId: string; capturedAt: string;
  elements: AXElement[]; text: string; warnings: string[]; screenshot?: NativeScreenshot;
}
/** @deprecated Legacy NDJSON binding. Restored CUA uses the original Sky binding and Swift IPC. */
export class MacApp {
  private queue = new SerialQueue();
  private current?: NativeObservation;
  private alive = true;
  constructor(readonly id: string, readonly info: NativeAppInfo, private provider: MacProvider) {}
  private async authorize(operation: string, effect: 'read' | 'write', signal?: AbortSignal) {
    checkAbort(signal); assert(this.alive, 'TARGET_NOT_FOUND', 'Native app handle released.');
    await this.provider.authorize(this.id, this.info, operation, effect); checkAbort(signal);
    assert(this.alive, 'TARGET_NOT_FOUND', 'App handle released during authorization.');
  }
  observe(options: NativeStateOptions = {}): Promise<NativeObservation> {
    return this.queue.run(async () => {
      await this.authorize('observe', 'read', options.signal);
      const { screenshot, ...state } = await this.provider.helper.request<{ snapshotId: string; elements: AXElement[]; warnings: string[]; screenshot?: ScreenshotWire }>(options.screenshot ? 'observeWithScreenshot' : 'observe', { targetId: this.id, windowId: options.windowId });
      checkAbort(options.signal);
      this.current = { ...state, ...(screenshot ? { screenshot: decodeScreenshot(screenshot) } : {}), sessionId: this.provider.sessionId, targetId: this.id, capturedAt: new Date().toISOString(),
        text: state.elements.map(element => `[${element.id}] ${element.role} ${JSON.stringify(element.name)}${element.value === undefined ? '' : ' value=' + JSON.stringify(element.value)}`).join('\n') };
      return structuredClone(this.current);
    });
  }
  async getAXState(options: ActionOptions = {}): Promise<string> { return (await this.observe(options)).text; }
  listWindows(options: ActionOptions = {}): Promise<NativeWindow[]> {
    return this.queue.run(async () => {
      await this.authorize('listWindows', 'read', options.signal);
      const result = await this.provider.helper.request<{ windows: NativeWindow[] }>('listWindows', { targetId: this.id });
      checkAbort(options.signal); return result.windows;
    });
  }
  captureScreenshot(options: NativeStateOptions = {}): Promise<NativeScreenshot> {
    return this.queue.run(async () => {
      await this.authorize('screenshot', 'read', options.signal);
      const result = await this.provider.helper.request<ScreenshotWire>('screenshot', { targetId: this.id, windowId: options.windowId });
      checkAbort(options.signal); return decodeScreenshot(result);
    });
  }
  async getScreenshot(options: NativeStateOptions = {}): Promise<Uint8Array> { return (await this.captureScreenshot(options)).bytes; }
  async getAXStateAndScreenshot(options: NativeStateOptions = {}): Promise<{ state: string; screenshot: Uint8Array }> {
    const result = await this.observe({ ...options, screenshot: true });
    assert(result.screenshot, 'PROVIDER_DISCONNECTED', 'Native screenshot missing from combined response.');
    return { state: result.text, screenshot: result.screenshot.bytes };
  }
  ref(elementId: number): ElementRef {
    assert(this.current && this.current.elements.some(element => element.id === elementId), 'STALE_OBSERVATION', 'Observe before choosing an element.');
    return { targetId: this.id, snapshotId: this.current.snapshotId, elementId };
  }
  private action(element: number | ElementRef, operation: string, value: string | undefined, options: ActionOptions, extra: Record<string, unknown> = {}) {
    return this.queue.run(async () => {
      await this.authorize(operation, 'write', options.signal);
      const ref = typeof element === 'number' ? this.ref(element) : element;
      assert(this.current && ref.targetId === this.id && ref.snapshotId === this.current.snapshotId, 'STALE_OBSERVATION', 'Element belongs to a stale or different snapshot.');
      this.current = undefined;
      return this.provider.helper.request<{ outcome: 'completed' }>('action', { targetId: this.id, snapshotId: ref.snapshotId, elementId: ref.elementId, operation, value, ...extra });
    });
  }
  click(element: number | ElementRef, options: ActionOptions = {}) { return this.action(element, 'press', undefined, options); }
  setValue(element: number | ElementRef, value: string, options: ActionOptions = {}) { return this.action(element, 'setValue', value, options); }
  selectText(element: number | ElementRef, text: string, options: SelectTextOptions = {}) {
    return this.action(element, 'selectText', text, options, {options:{prefix:options.prefix,suffix:options.suffix}});
  }
  performSecondaryAction(element: number | ElementRef, action: string, options: ActionOptions = {}) {
    return this.action(element, 'secondary', action, options);
  }
  private keyboard(operation: string, fields: Record<string, unknown>, options: ActionOptions) {
    return this.queue.run(async () => {
      await this.authorize(operation, 'write', options.signal);
      assert(this.current, 'STALE_OBSERVATION', 'Observe the app before keyboard input.');
      const snapshotId = this.current.snapshotId; this.current = undefined;
      return this.provider.helper.request<{outcome:'dispatched';eventPairs:number}>('keyboardInput',{targetId:this.id,snapshotId,operation,...fields});
    });
  }
  typeText(text: string, options: ActionOptions = {}) {
    assert(typeof text === 'string' && text.length <= 100000, 'INVALID_ARGUMENT', 'text must contain at most 100000 UTF-16 units.');
    return this.keyboard('typeText',{text},options);
  }
  pressKey(key: string, options: PressKeyOptions = {}) {
    assert(typeof key === 'string' && key.length > 0, 'INVALID_ARGUMENT', 'key must be nonempty.');
    assert((options.durationMs ?? 0) === 0, 'UNSUPPORTED_CAPABILITY', 'Native held keys require cancellable input scheduling.');
    return this.keyboard('pressKey',{key,durationMs:options.durationMs},options);
  }
  paste(text: string, options: PasteOptions & { timeoutMs?: number } = {}) {
    assert(typeof text === 'string' && text.length <= 200000,'INVALID_ARGUMENT','Paste input exceeds text budget.');
    const format = options.format ?? 'text';
    assert(['text','md','html'].includes(format),'INVALID_ARGUMENT','Unsupported paste format.');
    const timeoutMs = options.timeoutMs ?? 2000;
    assert(Number.isSafeInteger(timeoutMs) && timeoutMs >= 50 && timeoutMs <= 5000,'INVALID_ARGUMENT','Paste verification timeout must be 50..5000ms.');
    return this.queue.run(async () => {
      await this.authorize('paste','write',options.signal);
      assert(this.current,'STALE_OBSERVATION','Observe the focused native editor before paste.');
      const snapshotId = this.current.snapshotId;
      // The native helper owns rendering, editor validation and the entire clipboard lease.
      // Once dispatched, await the native result; aborting the caller cannot undo input.
      this.current = undefined;
      const result = await runClipboardOperation(async () => {
        checkAbort(options.signal);
        assert(this.alive,'TARGET_NOT_FOUND','App handle released while paste waited.');
        return this.provider.helper.request<{outcome:'observed';verification:'AXValue';clipboardRestored:boolean}>(
          'pasteFormatted',{targetId:this.id,snapshotId,text,format,timeoutMs});
      });
      assert(result?.outcome === 'observed' && result.verification === 'AXValue' && result.clipboardRestored === true,
        'ACTION_OUTCOME_UNKNOWN','Native paste did not confirm insertion and clipboard restoration; observe before retrying.');
      return result;
    });
  }
  async release(): Promise<void> { if (!this.alive) return; this.alive = false; this.current = undefined; await this.provider.helper.request('release', { targetId: this.id }); }
}
/** @deprecated Legacy NDJSON provider; use the restored MCP computer surface. */
export class MacProvider {
  readonly sessionId = randomUUID();
  readonly clipboard: NativeClipboard;
  private active = true;
  private constructor(readonly helper: NativeHelper, readonly capabilities: HelperHello, private policy: Authorize) { this.clipboard = new NativeClipboard(helper); }
  static async connect(options: { helperPath: string; authorize: Authorize }): Promise<MacProvider> {
    assert(typeof options.authorize === 'function', 'INVALID_ARGUMENT', 'Native provider needs authorize callback.');
    const { helper, hello } = await NativeHelper.connect(options.helperPath);
    return new MacProvider(helper, hello, options.authorize);
  }
  async authorize(targetId: string, app: NativeAppInfo, operation: string, effect: 'read' | 'write') {
    assert(this.active, 'SESSION_CLOSED', 'Native session ended.');
    assert(await this.policy({ sessionId: this.sessionId, targetId, url: `app://${encodeURIComponent(app.bundleId || app.path)}`, operation, effect }), 'PERMISSION_DENIED', 'Native application access denied.');
    assert(this.active, 'SESSION_CLOSED', 'Native session ended during authorization.');
  }
  async listApps(): Promise<NativeAppInfo[]> {
    assert(this.active, 'SESSION_CLOSED', 'Native session ended.');
    const { apps } = await this.helper.request<{ apps: NativeAppInfo[] }>('listApps');
    const visible: NativeAppInfo[] = [];
    for (const app of apps) {
      const allowed = await this.policy({ sessionId: this.sessionId, targetId: String(app.pid), url: `app://${encodeURIComponent(app.bundleId || app.path)}`, operation: 'listApps', effect: 'read' });
      if (allowed) visible.push(app);
    }
    return visible;
  }
  async getApp(reference: string | { pid: number }): Promise<MacApp> {
    const apps = await this.listApps();
    const matches = apps.filter(app => typeof reference === 'string' ? [app.name, app.bundleId, app.path].includes(reference) : app.pid === reference.pid);
    assert(matches.length > 0, 'TARGET_NOT_FOUND', 'Application not found or not authorized.');
    assert(matches.length === 1, 'AMBIGUOUS_TARGET', 'More than one application matches. Use PID.');
    const info = matches[0]!; await this.authorize(String(info.pid), info, 'getApp', 'read');
    const bound = await this.helper.request<{ targetId: string; app: NativeAppInfo }>('bind', { pid: info.pid });
    assert(bound.app.launchTime === info.launchTime && bound.app.bundleId === info.bundleId, 'TARGET_NOT_FOUND', 'App identity changed while binding.');
    return new MacApp(bound.targetId, bound.app, this);
  }
  async close(): Promise<void> { this.active = false; await this.helper.close(); }
}

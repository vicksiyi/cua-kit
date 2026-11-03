import { randomUUID } from 'node:crypto';
import { NativeHelper, type NativeAppInfo, type HelperHello } from './helper.js';
import { assert, checkAbort } from '../core/errors.js';
import type { Authorize, AXElement, ElementRef, ActionOptions } from '../core/types.js';
import { SerialQueue } from '../core/serial.js';

export interface NativeObservation {
  sessionId: string; targetId: string; snapshotId: string; capturedAt: string;
  elements: AXElement[]; text: string; warnings: string[];
}
export class MacApp {
  private queue = new SerialQueue();
  private current?: NativeObservation;
  private alive = true;
  constructor(readonly id: string, readonly info: NativeAppInfo, private provider: MacProvider) {}
  private async authorize(operation: string, effect: 'read' | 'write', signal?: AbortSignal) {
    checkAbort(signal); assert(this.alive, 'TARGET_NOT_FOUND', 'Native app handle released.');
    await this.provider.authorize(this.id, this.info, operation, effect); checkAbort(signal);
  }
  observe(options: ActionOptions = {}): Promise<NativeObservation> {
    return this.queue.run(async () => {
      await this.authorize('observe', 'read', options.signal);
      const state = await this.provider.helper.request<{ snapshotId: string; elements: AXElement[]; warnings: string[] }>('observe', { targetId: this.id });
      checkAbort(options.signal);
      this.current = { ...state, sessionId: this.provider.sessionId, targetId: this.id, capturedAt: new Date().toISOString(),
        text: state.elements.map(element => `[${element.id}] ${element.role} ${JSON.stringify(element.name)}${element.value === undefined ? '' : ' value=' + JSON.stringify(element.value)}`).join('\n') };
      return structuredClone(this.current);
    });
  }
  async getAXState(options: ActionOptions = {}): Promise<string> { return (await this.observe(options)).text; }
  ref(elementId: number): ElementRef {
    assert(this.current && this.current.elements.some(element => element.id === elementId), 'STALE_OBSERVATION', 'Observe before choosing an element.');
    return { targetId: this.id, snapshotId: this.current.snapshotId, elementId };
  }
  private action(element: number | ElementRef, operation: string, value: string | undefined, options: ActionOptions) {
    return this.queue.run(async () => {
      await this.authorize(operation, 'write', options.signal);
      const ref = typeof element === 'number' ? this.ref(element) : element;
      assert(this.current && ref.targetId === this.id && ref.snapshotId === this.current.snapshotId, 'STALE_OBSERVATION', 'Element belongs to a stale or different snapshot.');
      this.current = undefined;
      return this.provider.helper.request<{ outcome: 'completed' }>('action', { targetId: this.id, snapshotId: ref.snapshotId, elementId: ref.elementId, operation, value });
    });
  }
  click(element: number | ElementRef, options: ActionOptions = {}) { return this.action(element, 'press', undefined, options); }
  setValue(element: number | ElementRef, value: string, options: ActionOptions = {}) { return this.action(element, 'setValue', value, options); }
  release(): Promise<void> { return this.queue.run(async () => { if (!this.alive) return; this.alive = false; this.current = undefined; await this.provider.helper.request('release', { targetId: this.id }); }); }
}
export class MacProvider {
  readonly sessionId = randomUUID();
  private active = true;
  private constructor(readonly helper: NativeHelper, readonly capabilities: HelperHello, private policy: Authorize) {}
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

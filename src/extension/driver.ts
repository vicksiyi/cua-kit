import { EventEmitter } from 'node:events';
import type { BrowserDriver, BrowserFrame, CdpChannel } from '../browser/driver.js';
import { ExtensionBridge, type GrantedTab } from './bridge.js';
import { CuaError } from '../core/errors.js';

class ExtensionFrame implements BrowserFrame {
  constructor(readonly id: string, readonly sessionId: string | undefined, private address: string) {}
  url() { return this.address; }
}
export class ExtensionDriver extends EventEmitter implements BrowserDriver {
  private ended = false;
  private address: string;
  private frameList: ExtensionFrame[] = [];
  private sessions = new Set<string>();
  private modifiers = new Set<string>();
  private constructor(readonly tabId: number, private bridge: ExtensionBridge, tab: GrantedTab) {
    super(); this.address = tab.url;
    bridge.on('cdp', this.event); bridge.on('revoked', this.detached); bridge.on('detached', this.detached); bridge.on('disconnected', this.disconnected);
  }
  static async create(bridge: ExtensionBridge, tab: GrantedTab): Promise<ExtensionDriver> {
    const driver = new ExtensionDriver(tab.id, bridge, tab);
    try {
      await bridge.attach(tab.id);
      await driver.send('Page.enable');
      await driver.send('Target.setAutoAttach', { autoAttach:true, waitForDebuggerOnStart:false, flatten:true, filter:[{type:'iframe',exclude:false}] });
      await driver.prepareFrames(); return driver;
    } catch (error) { await driver.dispose(); throw error; }
  }
  private event = (event: { tabId: number; sessionId?: string; method: string; params: any }) => {
    if (event.tabId !== this.tabId) return;
    if (event.method === 'Target.attachedToTarget') {
      this.sessions.add(event.params.sessionId);
      void this.send('Page.enable', {}, event.params.sessionId).catch(() => {});
      void this.send('Target.setAutoAttach', { autoAttach:true, waitForDebuggerOnStart:false, flatten:true, filter:[{type:'iframe',exclude:false}] }, event.params.sessionId).catch(() => {});
    }
    if (event.method === 'Target.detachedFromTarget') this.sessions.delete(event.params.sessionId);
    if (event.method === 'Page.frameNavigated') {
      if (!event.sessionId && !event.params.frame.parentId) this.address = event.params.frame.url;
      this.emit('framenavigated');
    }
  };
  private detached = (event: { tabId: number }) => { if (event.tabId === this.tabId) this.disconnected(); };
  private disconnected = () => { if (!this.ended) { this.ended = true; this.emit('close'); } };
  private send(method: string, params: Record<string, unknown> = {}, sessionId?: string) {
    if (this.ended) return Promise.reject(new CuaError('PROVIDER_DISCONNECTED', 'Extension tab detached.'));
    return this.bridge.send(this.tabId, method, params, sessionId);
  }
  private channel(sessionId?: string): CdpChannel {
    return { send: ((method, params) => this.send(method, params as Record<string, unknown> | undefined, sessionId)) as CdpChannel['send'],
      detach: async () => { /* Per-capture channels share the driver-owned debugger attachment. */ } };
  }
  context() {
    return { newCDPSession: async (target: BrowserDriver | BrowserFrame): Promise<CdpChannel> => {
      if (target === this) return this.channel();
      if (target instanceof ExtensionFrame && target.sessionId) return this.channel(target.sessionId);
      throw new Error('Frame does not have a separate CDP session');
    } };
  }
  url() { return this.address; }
  isClosed() { return this.ended; }
  mainFrame(): BrowserFrame { return this.frameList[0]!; }
  frames(): BrowserFrame[] { return this.frameList; }
  async prepareFrames(): Promise<void> {
    const frames = new Map<string, ExtensionFrame>();
    const walk = (tree: any, sessionId?: string) => {
      frames.set(tree.frame.id, new ExtensionFrame(tree.frame.id, sessionId, tree.frame.url));
      for (const child of tree.childFrames ?? []) walk(child, sessionId);
    };
    walk((await this.send('Page.getFrameTree')).frameTree);
    for (const sessionId of this.sessions) {
      try { walk((await this.send('Page.getFrameTree', {}, sessionId)).frameTree, sessionId); }
      catch { this.sessions.delete(sessionId); }
    }
    this.frameList = [...frames.values()];
  }
  async waitForLoadState(_: 'domcontentloaded', options: { timeout: number }): Promise<void> {
    const until = Date.now() + options.timeout;
    while (Date.now() < until) {
      const state = await this.send('Runtime.evaluate', { expression:'document.readyState', returnByValue:true });
      if (['interactive','complete'].includes(state.result?.value)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new CuaError('CANCELLED', 'Extension page load timed out.');
  }
  async goto(url: string, options: { waitUntil: 'domcontentloaded'; timeout: number }): Promise<void> {
    const result = await this.send('Page.navigate', { url });
    if (result.errorText) throw new CuaError('PROVIDER_DISCONNECTED', result.errorText);
    this.address = url; await this.waitForLoadState(options.waitUntil, options);
  }
  async close(): Promise<void> { await this.bridge.request('closeTab', { tabId: this.tabId }); this.disconnected(); }
  async dispose(): Promise<void> {
    this.bridge.off('cdp', this.event); this.bridge.off('revoked', this.detached); this.bridge.off('detached', this.detached); this.bridge.off('disconnected', this.disconnected);
    if (!this.ended) await this.bridge.detach(this.tabId).catch(() => {});
    this.disconnected();
  }
  keyboard = {
    down: async (key: string) => { await this.keyEvent(key, true); },
    up: async (key: string) => { await this.keyEvent(key, false); },
  };
  private async keyEvent(key: string, down: boolean) {
    const names: Record<string, [string, number]> = { Enter:['Enter',13], Tab:['Tab',9], Backspace:['Backspace',8], Escape:['Escape',27], Delete:['Delete',46], ArrowLeft:['ArrowLeft',37], ArrowUp:['ArrowUp',38], ArrowRight:['ArrowRight',39], ArrowDown:['ArrowDown',40], Home:['Home',36], End:['End',35], PageUp:['PageUp',33], PageDown:['PageDown',34], Shift:['ShiftLeft',16], Control:['ControlLeft',17], Alt:['AltLeft',18], Meta:['MetaLeft',91], ' ':['Space',32] };
    let definition = names[key];
    if (!definition && /^[a-z]$/i.test(key)) definition = ['Key'+key.toUpperCase(),key.toUpperCase().charCodeAt(0)];
    if (!definition && /^[0-9]$/.test(key)) definition = ['Digit'+key,key.charCodeAt(0)];
    const symbols: Record<string, [string,number]> = { '+':['Equal',187], '=':['Equal',187], '-':['Minus',189], '.':['Period',190], ',':['Comma',188], '/':['Slash',191] };
    definition ??= symbols[key];
    if (!definition) throw new CuaError('UNSUPPORTED_CAPABILITY', `Extension key mapping is not implemented: ${key}`);
    const flags: Record<string,number> = {Alt:1,Control:2,Meta:4,Shift:8};
    if (flags[key]) { if (down) this.modifiers.add(key); else this.modifiers.delete(key); }
    const modifiers = [...this.modifiers].reduce((mask,key) => mask | flags[key]!,0);
    const text = down && key.length === 1 && !(modifiers & 7) ? (this.modifiers.has('Shift') ? key.toUpperCase() : key) : undefined;
    await this.send('Input.dispatchKeyEvent', { type:down ? 'keyDown':'keyUp', key, code:definition[0], windowsVirtualKeyCode:definition[1], modifiers, ...(text ? {text,unmodifiedText:text}: {}) });
  }
}

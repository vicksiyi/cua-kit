import { randomUUID } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { ClipboardBackend } from './core/clipboard.js';
import { ExtensionBridge } from './extension/bridge.js';
import { ExtensionProvider } from './extension/provider.js';
import { MacProvider, MacApp } from './native/provider.js';
import { CuaTab } from './browser/tab.js';
import { assert, checkAbort, CuaError } from './core/errors.js';
import type { Authorize, AuditEvent, ActionOptions } from './core/types.js';
export { CuaTab, CuaError, MacProvider, MacApp, ExtensionBridge, ExtensionProvider };
export type * from './core/types.js';
export type { ClipboardBackend, ClipboardContent } from './core/clipboard.js';

export interface CuaOptions {
  headless?: boolean;
  executablePath?: string;
  nativeHelperPath?: string;
  extensionBridge?: ExtensionBridge;
  clipboard?: ClipboardBackend;
  /** Required: access decisions belong to the embedding application. */
  authorize: Authorize;
  audit?: (event: AuditEvent) => void;
}
export interface TabInfo { id: string; browserId: string; title: string; url: string }
export interface BrowserInfo { id: string; name: string; type: 'cdp' }

/**
 * Legacy independent SDK; this is not the source-restored global CUA API.
 * @deprecated Use the restored MCP runtime and its kernel-provided global cua.
 * Existing prototype consumers may explicitly import the /legacy entry.
 */
export class Cua {
  readonly sessionId = randomUUID();
  private active = true;
  private generation = 0;
  private native?: MacProvider;
  private extension?: ExtensionProvider;
  private apps = new Set<MacApp>();
  private pages = new Map<string, Page>();
  private ids = new WeakMap<Page, string>();
  private tabs = new Map<string, Promise<CuaTab>>();
  private constructor(private browser: Browser, private context: BrowserContext, private options: CuaOptions) {
    for (const page of context.pages()) this.register(page);
    context.on('page', page => this.register(page));
  }
  static async launch(options: CuaOptions): Promise<Cua> {
    assert(typeof options?.authorize === 'function', 'INVALID_ARGUMENT', 'An authorize callback is required.');
    const browser = await chromium.launch({ headless: options.headless ?? true, executablePath: options.executablePath });
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
      context.setDefaultTimeout(5000);
      const cua = new Cua(browser, context, options);
      if (options.nativeHelperPath) cua.native = await MacProvider.connect({ helperPath: options.nativeHelperPath, authorize: options.authorize });
      if (options.extensionBridge) cua.extension = new ExtensionProvider(options.extensionBridge, {...options,clipboard:options.clipboard ?? cua.native?.clipboard});
      return cua;
    } catch (error) { await browser.close(); throw error; }
  }
  private assertActive(): void { assert(this.active, 'SESSION_CLOSED', 'Session ended.'); }
  private checkGeneration(generation: number, signal?: AbortSignal): void {
    this.assertActive(); checkAbort(signal);
    assert(generation === this.generation, 'CANCELLED', 'Operation belongs to a reset session.');
  }
  private register(page: Page): string {
    const previous = this.ids.get(page);
    if (previous) return previous;
    const id = randomUUID(); this.ids.set(page, id); this.pages.set(id, page);
    page.once('close', () => { this.pages.delete(id); this.tabs.delete(id); });
    return id;
  }
  async listBrowsers(): Promise<BrowserInfo[]> {
    this.assertActive(); return [{ id: 'chromium', name: 'Managed Chromium', type: 'cdp' }, ...(this.extension ? [{id:'chrome-extension',name:'Granted Chrome tabs',type:'cdp' as const}] : [])];
  }
  async listTabs(options: { browser?: string } = {}): Promise<TabInfo[]> {
    this.assertActive(); this.validateBrowser(options.browser);
    const extensionTabs = async () => (await this.extension!.listTabs()).map(tab => ({id:`ext:${tab.id}`,browserId:'chrome-extension',title:tab.title,url:tab.url}));
    if (options.browser === 'chrome-extension') return extensionTabs();
    const generation = this.generation;
    const result: TabInfo[] = [];
    for (const [id, page] of this.pages) {
      const url = page.url();
      if (await this.options.authorize({ sessionId: this.sessionId, targetId: id, url, operation: 'listTabs', effect: 'read' })) {
        this.checkGeneration(generation);
        assert(url === page.url(), 'STALE_OBSERVATION', 'Tab navigated during discovery authorization.');
        if (!page.isClosed()) {
          const title = await page.title();
          assert(url === page.url(), 'STALE_OBSERVATION', 'Tab navigated during title read.');
          result.push({ id, browserId: 'chromium', title, url });
        }
      }
    }
    if (!options.browser && this.extension) result.push(...await extensionTabs());
    return result;
  }
  async listApps() { this.assertActive(); return this.native ? this.native.listApps() : []; }
  async getApp(reference: string | { pid: number }, options: ActionOptions = {}): Promise<MacApp> {
    this.assertActive(); assert(this.native, 'UNSUPPORTED_CAPABILITY', 'Configure nativeHelperPath to connect the macOS provider.');
    const generation = this.generation; checkAbort(options.signal);
    const app = await this.native.getApp(reference);
    try { this.checkGeneration(generation, options.signal); await app.observe(options); this.checkGeneration(generation, options.signal); this.apps.add(app); return app; }
    catch (error) { await app.release(); throw error; }
  }
  async getState() { return { apps: await this.listApps(), browsers: await Promise.all((await this.listBrowsers()).map(async browser => ({...browser,tabs:await this.listTabs({browser:browser.id})}))) }; }
  async getBrowser(options: { id?: string } = {}) {
    this.assertActive(); this.validateBrowser(options.id);
    if (options.id === 'chrome-extension') return {browserId:'chrome-extension',tabs:{list:()=>this.listTabs({browser:'chrome-extension'}),get:(id:string)=>this.getTab(id,{browser:'chrome-extension'}),new:async()=>{throw new CuaError('UNSUPPORTED_CAPABILITY','New extension tabs require user browser consent; create in browser and grant.');}}};
    return { browserId: 'chromium', tabs: { list: () => this.listTabs(), get: (id: string) => this.getTab(id), new: () => this.createBrowserTab('chromium') } };
  }
  async getTab(reference: string | { url: string }, options: { browser?: string; signal?: AbortSignal } = {}): Promise<CuaTab> {
    this.assertActive(); this.validateBrowser(options.browser);
    if ((typeof reference === 'string' && reference.startsWith('ext:')) || options.browser === 'chrome-extension') {
      assert(options.browser === undefined || options.browser === 'chrome-extension', 'INVALID_ARGUMENT', 'Extension tab ID conflicts with requested browser.');
      assert(this.extension, 'TARGET_NOT_FOUND', 'Extension provider is not connected.');
      return this.extension.getTab(typeof reference === 'string' ? Number(reference.replace(/^ext:/,'')) : reference, options);
    }
    const generation = this.generation; checkAbort(options.signal);
    let id: string;
    if (typeof reference === 'string') id = reference;
    else {
      assert(reference && typeof reference.url === 'string', 'INVALID_ARGUMENT', 'Expected a tab ID or exact URL reference.');
      assert(options.browser, 'INVALID_ARGUMENT', 'URL references require an explicit browser.');
      new URL(reference.url);
      const matches = (await this.listTabs(options)).filter(tab => tab.url === reference.url);
      assert(matches.length > 0, 'TARGET_NOT_FOUND', 'No tab matches this URL.');
      assert(matches.length === 1, 'AMBIGUOUS_TARGET', 'Multiple tabs match this URL. Use an explicit tab ID.');
      id = matches[0]!.id;
    }
    this.checkGeneration(generation, options.signal);
    const page = this.pages.get(id);
    assert(page && !page.isClosed(), 'TARGET_NOT_FOUND', 'Tab ID is not owned by this session.');
    let tab = this.tabs.get(id);
    if (!tab) {
      tab = CuaTab.create(id, page, { sessionId: this.sessionId, authorize: this.options.authorize, audit: this.options.audit, active: () => this.active, clipboard: this.options.clipboard ?? (this.options.headless === false ? this.native?.clipboard : undefined) });
      this.tabs.set(id, tab);
      const creating = tab;
      tab.catch(() => { if (this.tabs.get(id) === creating) this.tabs.delete(id); });
    }
    const bound = await tab;
    this.checkGeneration(generation, options.signal);
    await bound.observe({ disableDiffing: true, signal: options.signal });
    this.checkGeneration(generation, options.signal);
    return bound;
  }
  async createBrowserTab(browserId: string, url = 'about:blank', options: ActionOptions = {}): Promise<CuaTab> {
    this.assertActive(); this.validateBrowser(browserId);
    assert(browserId !== 'chrome-extension', 'UNSUPPORTED_CAPABILITY', 'Create a tab in the browser and grant it with the extension action.');
    const generation = this.generation; checkAbort(options.signal);
    assert(await this.options.authorize({ sessionId: this.sessionId, targetId: 'new', url, operation: 'createBrowserTab', effect: 'write' }), 'PERMISSION_DENIED', 'Creating this tab was denied.');
    this.checkGeneration(generation, options.signal);
    const page = await this.context.newPage();
    const id = this.register(page);
    try {
      this.checkGeneration(generation, options.signal);
      const tab = await this.getTab(id, options);
      if (url !== 'about:blank') { await tab.goto(url, options); await tab.observe({ disableDiffing: true, signal: options.signal }); }
      this.checkGeneration(generation, options.signal); return tab;
    } catch (error) { await page.close().catch(() => undefined); throw error; }
  }
  private validateBrowser(id?: string): void { assert(id === undefined || id === 'chromium' || (id === 'chrome-extension' && !!this.extension), 'TARGET_NOT_FOUND', 'Only the managed chromium backend is currently connected.'); }
  async reset(): Promise<void> {
    this.assertActive(); this.generation++;
    await Promise.allSettled([...this.tabs.values()].map(async tab => (await tab).dispose()));
    this.tabs.clear();
    await Promise.allSettled([...this.apps].map(app => app.release())); this.apps.clear(); await this.extension?.reset();
  }
  async endSession(): Promise<void> {
    if (!this.active) return;
    this.active = false;
    await Promise.allSettled([...this.tabs.values()].map(async tab => (await tab).dispose()));
    try { await this.context.close(); } finally { await this.browser.close(); await this.native?.close(); await this.extension?.close(); }
  }
}
/** @deprecated Legacy SDK factory; use the restored MCP runtime for original CUA semantics. */
export const createCua = Cua.launch;

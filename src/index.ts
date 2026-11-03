import { randomUUID } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { MacProvider, MacApp } from './native/provider.js';
import { CuaTab } from './browser/tab.js';
import { assert, CuaError } from './core/errors.js';
import type { Authorize, AuditEvent } from './core/types.js';
export { CuaTab, CuaError, MacProvider, MacApp };
export type * from './core/types.js';

export interface CuaOptions {
  headless?: boolean;
  executablePath?: string;
  nativeHelperPath?: string;
  /** Required: access decisions belong to the embedding application. */
  authorize: Authorize;
  audit?: (event: AuditEvent) => void;
}
export interface TabInfo { id: string; browserId: string; title: string; url: string }
export interface BrowserInfo { id: string; name: string; type: 'cdp' }

/** One SDK instance owns one isolated Chromium context, not the user's profile. */
export class Cua {
  readonly sessionId = randomUUID();
  private active = true;
  private native?: MacProvider;
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
      return cua;
    } catch (error) { await browser.close(); throw error; }
  }
  private assertActive(): void { assert(this.active, 'SESSION_CLOSED', 'Session ended.'); }
  private register(page: Page): string {
    const previous = this.ids.get(page);
    if (previous) return previous;
    const id = randomUUID(); this.ids.set(page, id); this.pages.set(id, page);
    page.once('close', () => { this.pages.delete(id); this.tabs.delete(id); });
    return id;
  }
  async listBrowsers(): Promise<BrowserInfo[]> {
    this.assertActive(); return [{ id: 'chromium', name: 'Managed Chromium', type: 'cdp' }];
  }
  async listTabs(options: { browser?: string } = {}): Promise<TabInfo[]> {
    this.assertActive(); this.validateBrowser(options.browser);
    const result: TabInfo[] = [];
    for (const [id, page] of this.pages) {
      const url = page.url();
      if (await this.options.authorize({ sessionId: this.sessionId, targetId: id, url, operation: 'listTabs', effect: 'read' })) {
        if (!page.isClosed()) result.push({ id, browserId: 'chromium', title: await page.title(), url });
      }
    }
    return result;
  }
  async listApps() { this.assertActive(); return this.native ? this.native.listApps() : []; }
  async getApp(reference: string | { pid: number }): Promise<MacApp> {
    this.assertActive(); assert(this.native, 'UNSUPPORTED_CAPABILITY', 'Configure nativeHelperPath to connect the macOS provider.');
    const app = await this.native.getApp(reference);
    try { await app.observe(); this.apps.add(app); return app; }
    catch (error) { await app.release(); throw error; }
  }
  async getState() { return { apps: await this.listApps(), browsers: [{ ...(await this.listBrowsers())[0]!, tabs: await this.listTabs() }] }; }
  async getBrowser(options: { id?: string } = {}) {
    this.assertActive(); this.validateBrowser(options.id);
    return { browserId: 'chromium', tabs: { list: () => this.listTabs(), get: (id: string) => this.getTab(id), new: () => this.createBrowserTab('chromium') } };
  }
  async getTab(reference: string | { url: string }, options: { browser?: string } = {}): Promise<CuaTab> {
    this.assertActive(); this.validateBrowser(options.browser);
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
    const page = this.pages.get(id);
    assert(page && !page.isClosed(), 'TARGET_NOT_FOUND', 'Tab ID is not owned by this session.');
    let tab = this.tabs.get(id);
    if (!tab) {
      tab = CuaTab.create(id, page, { sessionId: this.sessionId, authorize: this.options.authorize, audit: this.options.audit, active: () => this.active });
      this.tabs.set(id, tab);
      tab.catch(() => this.tabs.delete(id));
    }
    const bound = await tab;
    await bound.observe({ disableDiffing: true });
    return bound;
  }
  async createBrowserTab(browserId: string, url = 'about:blank'): Promise<CuaTab> {
    this.assertActive(); this.validateBrowser(browserId);
    assert(await this.options.authorize({ sessionId: this.sessionId, targetId: 'new', url, operation: 'createBrowserTab', effect: 'write' }), 'PERMISSION_DENIED', 'Creating this tab was denied.');
    const page = await this.context.newPage();
    const id = this.register(page);
    try {
      const tab = await this.getTab(id);
      if (url !== 'about:blank') { await tab.goto(url); await tab.observe({ disableDiffing: true }); }
      return tab;
    } catch (error) { await page.close(); throw error; }
  }
  private validateBrowser(id?: string): void { assert(id === undefined || id === 'chromium', 'TARGET_NOT_FOUND', 'Only the managed chromium backend is currently connected.'); }
  async reset(): Promise<void> {
    this.assertActive();
    await Promise.allSettled([...this.tabs.values()].map(async tab => (await tab).dispose()));
    this.tabs.clear();
    await Promise.allSettled([...this.apps].map(app => app.release())); this.apps.clear();
  }
  async endSession(): Promise<void> {
    if (!this.active) return;
    this.active = false;
    await Promise.allSettled([...this.tabs.values()].map(async tab => (await tab).dispose()));
    try { await this.context.close(); } finally { await this.browser.close(); await this.native?.close(); }
  }
}
export const createCua = Cua.launch;

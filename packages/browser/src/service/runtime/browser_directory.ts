import {
  findDirectoryBrowser,
  selectDefaultBrowser,
  selectBrowserForUrl,
  matchesBrowserPreference,
} from "./browser_selection";
import { browserSummary } from "../browser_info";
export interface DirectoryDependencies {
  ClientApi: new () => any;
  TurnEndedTracker: new (runtime: any) => any;
  BrowserApi: new (...args: any[]) => any;
  discover(
    runtime: any,
    createApi: (transport: any) => any,
    previous: any[],
    preferences: any,
  ): Promise<any[]>;
  turnMetadata(runtime: any): any;
  surfaceEnabled(runtime: any, surface: string): boolean;
  assertSurfaceEnabled(runtime: any, surface: string): void;
  findBrowser(browsers: any[], id: string): any;
  selectDefault(browsers: any[], preference: any): any;
  selectForUrl(browsers: any[], url: string, preference: any): Promise<any>;
  matchesPreference(info: any, preference: any): boolean;
  connect(pipe: any): Promise<any>;
  readInfo(runtime: any, api: any, preferences: any): Promise<any>;
}
/** Original mb. */
export class BrowserClientApi {
  ping() {
    return "pong";
  }
}
/** Original yb. Transport/discovery dependencies are explicit while production bootstrap is reconstructed. */
type SelectionDependencies =
  "findBrowser" | "selectDefault" | "selectForUrl" | "matchesPreference";
export function createBrowserDirectoryClass(
  supplied: Omit<DirectoryDependencies, SelectionDependencies> &
    Partial<Pick<DirectoryDependencies, SelectionDependencies>>,
) {
  const deps = {
    findBrowser: findDirectoryBrowser,
    selectDefault: selectDefaultBrowser,
    selectForUrl: selectBrowserForUrl,
    matchesPreference: matchesBrowserPreference,
    ...supplied,
  };
  return class BrowserDirectory {
    runtime: any;
    browserPreference: any;
    preferences: any;
    browsers: any[] | null = null;
    dotBrowser: Promise<any> | null = null;
    clientApi = new deps.ClientApi();
    refreshPromise: Promise<void> | null = null;
    turnEndedTracker: any;
    trackedApis = new WeakSet<object>();
    constructor(runtime: any, preference: any = null, preferences?: any) {
      this.runtime = runtime;
      this.browserPreference = preference;
      this.preferences = preferences;
      this.turnEndedTracker = new deps.TurnEndedTracker(runtime);
    }
    async refresh() {
      this.refreshPromise ??= (async () => {
        const browsers = await deps.discover(
          this.runtime,
          (transport) =>
            new deps.BrowserApi(
              transport,
              this.clientApi,
              () => deps.turnMetadata(this.runtime),
              this.turnEndedTracker,
              async () => this.preferences?.getExtensionRequestHeaders(),
            ),
          this.browsers ?? [],
          this.preferences,
        );
        this.browsers = browsers;
        for (const browser of browsers) this.trackBrowser(browser);
      })().finally(() => {
        this.refreshPromise = null;
      });
      await this.refreshPromise;
    }
    async list() {
      const browsers = await this.getBrowsers(),
        summaries = browsers.map(({ id, info }) => browserSummary(id, info));
      if (
        deps.surfaceEnabled(this.runtime, "dot") &&
        deps.findBrowser(browsers, "iab") != null
      )
        try {
          await this.getDotBrowser();
          summaries.push({ id: "dot", name: "Dot", type: "iab" } as any);
        } catch {}
      return summaries;
    }
    async get(id: string) {
      if (id === "dot") return this.getDotBrowser();
      const browser = deps.findBrowser(await this.getBrowsers(), id);
      if (browser == null) throw new Error(`Browser is not available: ${id}`);
      return browser;
    }
    async getDefault() {
      const browser = deps.selectDefault(
        await this.getBrowsers(),
        this.browserPreference,
      );
      if (browser == null) throw new Error("No browser is available");
      return browser;
    }
    async getForUrl(url: string) {
      const browser = await deps.selectForUrl(
        await this.getBrowsers(),
        url,
        this.browserPreference,
      );
      if (browser == null) throw new Error("No browser is available");
      return browser;
    }
    preferredWindowIdFor(info: any) {
      return deps.matchesPreference(info, this.browserPreference)
        ? this.browserPreference?.preferredWindowId
        : undefined;
    }
    async dispose() {
      if (this.refreshPromise != null) await this.refreshPromise;
      const dot = this.dotBrowser;
      this.dotBrowser = null;
      this.turnEndedTracker.dispose();
      const browsers = this.browsers;
      this.browsers = null;
      await Promise.all([
        ...(browsers?.map(({ api }) => api.close()) ?? []),
        dot?.then(({ api }) => api.close()),
      ]);
    }
    async getBrowsers() {
      if (this.browsers == null) await this.refresh();
      return this.browsers ?? [];
    }
    async getDotBrowser(): Promise<any> {
      deps.assertSurfaceEnabled(this.runtime, "dot");
      const iab = deps.findBrowser(await this.getBrowsers(), "iab");
      if (iab == null) throw new Error("Browser is not available: dot");
      if (this.dotBrowser != null) {
        const pending = this.dotBrowser,
          dot = await pending;
        if (dot.pipe === iab.pipe) {
          await dot.api.getInfo();
          return dot;
        }
        if (this.dotBrowser === pending) this.dotBrowser = null;
        await dot.api.close();
      }
      if (this.dotBrowser != null) return this.dotBrowser;
      const pending = this.connectDotBrowser(iab);
      this.dotBrowser = pending;
      try {
        const dot = await pending;
        dot.api.addCloseListener(() => {
          if (this.dotBrowser === pending) this.dotBrowser = null;
        });
        return dot;
      } catch (error) {
        if (this.dotBrowser === pending) this.dotBrowser = null;
        throw error;
      }
    }
    async connectDotBrowser(iab: any) {
      const api = new deps.BrowserApi(
        await deps.connect(iab.pipe),
        this.clientApi,
        () => deps.turnMetadata(this.runtime),
        this.turnEndedTracker,
        async () => this.preferences?.getExtensionRequestHeaders(),
        "dot",
        () => deps.assertSurfaceEnabled(this.runtime, "dot"),
      );
      try {
        const info = await deps.readInfo(this.runtime, api, this.preferences);
        if (
          info.type !== "iab" ||
          info.apiSupportOverrides?.["Browser.user"] !== true ||
          info.apiSupportOverrides["BrowserUser.claimTab"] === false ||
          info.apiSupportOverrides["BrowserUser.openTabs"] === false
        )
          throw new Error(
            "The connected browser does not support Dot tab claims.",
          );
        return {
          api,
          id: "dot",
          info: { ...info, name: "Dot" },
          pipe: iab.pipe,
        };
      } catch (error) {
        await api.close();
        throw error;
      }
    }
    trackBrowser(browser: any) {
      if (!this.trackedApis.has(browser.api)) {
        this.trackedApis.add(browser.api);
        browser.api.addCloseListener(() => {
          if (this.browsers != null)
            this.browsers = this.browsers.filter(
              (candidate) => candidate !== browser,
            );
        });
      }
    }
  };
}
/** Original fb. Cleanup callbacks are removed before awaiting and failures are reported independently. */
export function createTurnEndedTrackerClass(
  reportError: (error: Error) => void,
) {
  return class TurnEndedTracker {
    removeTurnEndedHandler: () => void;
    disposed = false;
    sessions = new Map<string, Map<(turn: any) => Promise<unknown>, string>>();
    constructor(runtime: any) {
      if (runtime.addTurnEndedHandler == null)
        throw new Error("Browser Use requires Node REPL turn-ended hooks");
      this.removeTurnEndedHandler = runtime.addTurnEndedHandler({
        timeoutMs: 4000,
        run: ({ session_id, turn_id }: any) =>
          this.finishTurn({ session_id, turn_id }),
      });
    }
    async track(
      { session_id, turn_id }: any,
      callback: (turn: any) => Promise<unknown>,
    ) {
      if (this.disposed) return;
      let callbacks = this.sessions.get(session_id);
      if (callbacks == null) {
        callbacks = new Map();
        this.sessions.set(session_id, callbacks);
      }
      callbacks.set(callback, turn_id);
    }
    dispose() {
      if (!this.disposed) {
        this.disposed = true;
        this.removeTurnEndedHandler();
        this.sessions.clear();
      }
    }
    async finishTurn(turn: any) {
      const callbacks = this.sessions.get(turn.session_id);
      if (callbacks == null) return;
      const pending = [];
      for (const [callback, turnId] of callbacks)
        if (turnId === turn.turn_id) {
          callbacks.delete(callback);
          pending.push(callback);
        }
      if (callbacks.size === 0) this.sessions.delete(turn.session_id);
      await Promise.all(
        pending.map(async (callback) => {
          try {
            await callback(turn);
          } catch {
            reportError(new Error("Browser turn cleanup failed"));
          }
        }),
      );
    }
  };
}

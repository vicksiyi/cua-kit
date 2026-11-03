import { CdpEventEmitter } from "../cdp/event_emitter";

const documentPattern = { requestStage: "Response", resourceType: "Document" };
const preserveDebugger = { preserveDebuggerOnTimeout: true };
const requestPattern = { requestStage: "Request" };
export interface PausedRequest {
  requestId: string;
  resourceType?: string;
  responseStatusCode?: number;
  responseErrorReason?: string;
  responseStatusText?: string;
  responseHeaders?: Array<{ name: string; value: string }>;
  [key: string]: any;
}
interface ResponseCdp {
  call(tabId: number, method: string, params: any, options?: any): Promise<any>;
  isTabAttached(tabId: number): boolean;
  addTabAttachHandler(handler: (tabId: number, options: any) => any): unknown;
  on(event: string, handler: (...args: any[]) => any): unknown;
}
type Interceptor = (request: PausedRequest) => unknown | Promise<unknown>;
interface InterceptorEntry {
  interceptor: Interceptor;
  priority: number;
  pendingRequests: Set<Promise<void>> | undefined;
}
/** Original Xh/Mc/su/Yre: owns document responses and serializes request interception changes. */
export class DocumentResponses extends CdpEventEmitter {
  cdp: ResponseCdp;
  ownedResponsesByTab = new Map<number, Set<string>>();
  setupByTab = new Map<number, Promise<any>>();
  requestInterceptorsByTab = new Map<number, InterceptorEntry[]>();
  configurationByTab = new Map<number, Promise<void>>();
  configuredRequestsByTab = new Set<number>();
  constructor(cdp: ResponseCdp) {
    super();
    this.cdp = cdp;
    cdp.addTabAttachHandler((tabId, options) => {
      if (!this.setupByTab.has(tabId)) return this.ensureInterceptionReady(tabId, options);
    });
    cdp.on("tabDetached", (tabId) => {
      this.ownedResponsesByTab.delete(tabId);
      this.setupByTab.delete(tabId);
      this.requestInterceptorsByTab.delete(tabId);
      this.configurationByTab.delete(tabId);
      this.configuredRequestsByTab.delete(tabId);
      this.emit("tabDetached", tabId);
    });
    cdp.on("event", (event) => { this.handleEvent(event).catch(() => {}); });
  }
  ensureInterceptionReady(tabId: number, options = {}) {
    const existing = this.setupByTab.get(tabId);
    if (existing != null) return existing;
    const setup = this.cdp.call(tabId, "Fetch.enable", { patterns: [documentPattern] }, options);
    this.setupByTab.set(tabId, setup);
    setup.catch(() => {
      if (this.setupByTab.get(tabId) === setup) this.setupByTab.delete(tabId);
    });
    return setup;
  }
  async addRequestInterceptor(tabId: number, interceptor: Interceptor, priority = 0, options?: { drainOnRemove?: boolean }) {
    await this.ensureInterceptionReady(tabId);
    const entries = this.requestInterceptorsByTab.get(tabId) ?? [];
    const entry: InterceptorEntry = { interceptor, priority, pendingRequests: options?.drainOnRemove ? new Set() : undefined };
    entries.push(entry);
    entries.sort((a, b) => b.priority - a.priority);
    this.requestInterceptorsByTab.set(tabId, entries);
    try { await this.configureRequestInterception(tabId); }
    catch (error) {
      entries.splice(entries.indexOf(entry), 1);
      if (entries.length === 0) this.requestInterceptorsByTab.delete(tabId);
      if (entry.pendingRequests != null) await Promise.all(entry.pendingRequests);
      throw error;
    }
    return async () => {
      const current = this.requestInterceptorsByTab.get(tabId);
      const index = current?.indexOf(entry) ?? -1;
      if (current != null && index >= 0) {
        current.splice(index, 1);
        if (current.length === 0) this.requestInterceptorsByTab.delete(tabId);
      }
      if (entry.pendingRequests != null) await Promise.all(entry.pendingRequests);
      if (index >= 0) await this.configureRequestInterception(tabId);
    };
  }
  hasOwnedPausedResponses(tabId: number) { return (this.ownedResponsesByTab.get(tabId)?.size ?? 0) > 0; }
  hasRequestInterceptors(tabId: number) { return this.requestInterceptorsByTab.has(tabId); }
  async continueResponse(tabId: number, requestId: string, overrides?: Record<string, unknown>) {
    await this.cdp.call(tabId, "Fetch.continueResponse", { requestId, ...overrides }, preserveDebugger);
    this.release(tabId, requestId);
  }
  async failResponse(tabId: number, requestId: string) {
    await this.cdp.call(tabId, "Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }, preserveDebugger);
    this.release(tabId, requestId);
  }
  async handleEvent(event: { method: string; source: { tabId?: number; sessionId?: string; targetId?: string }; params: PausedRequest }) {
    if (event.method !== "Fetch.requestPaused") return;
    const tabId = event.source.tabId;
    if (typeof tabId !== "number" || event.source.sessionId != null || event.source.targetId != null) return;
    if (event.params.responseStatusCode == null && event.params.responseErrorReason == null) {
      if (!this.requestInterceptorsByTab.has(tabId) && !this.configuredRequestsByTab.has(tabId)) return;
      await this.handleRequest(tabId, event.params);
      return;
    }
    if (event.params.resourceType !== "Document") return;
    const requestId = event.params.requestId;
    const owned = this.ownedResponsesByTab.get(tabId) ?? new Set<string>();
    owned.add(requestId);
    this.ownedResponsesByTab.set(tabId, owned);
    if (event.params.responseErrorReason != null) {
      await this.cdp.call(tabId, "Fetch.continueRequest", { requestId }, preserveDebugger);
      this.release(tabId, requestId);
      return;
    }
    let intercepted = false;
    this.emit("intercept", tabId, event.params, () => { intercepted = true; });
    if (intercepted) return;
    const headers = event.params.responseHeaders;
    this.emit("response", tabId, event.params);
    await this.continueResponse(tabId, requestId, event.params.responseHeaders === headers ? undefined : {
      responseCode: event.params.responseStatusCode,
      ...(event.params.responseStatusText ? { responsePhrase: event.params.responseStatusText } : {}),
      responseHeaders: event.params.responseHeaders,
    });
  }
  configureRequestInterception(tabId: number) {
    const configuration = (this.configurationByTab.get(tabId) ?? Promise.resolve()).catch(() => {}).then(async () => {
      if (!this.cdp.isTabAttached(tabId)) return;
      const enabled = this.requestInterceptorsByTab.has(tabId);
      if (this.configuredRequestsByTab.has(tabId) !== enabled) {
        await this.cdp.call(tabId, "Fetch.enable", { patterns: enabled ? [requestPattern, documentPattern] : [documentPattern] }, preserveDebugger);
        if (enabled) this.configuredRequestsByTab.add(tabId);
        else this.configuredRequestsByTab.delete(tabId);
      }
    });
    this.configurationByTab.set(tabId, configuration);
    configuration.finally(() => {
      if (this.configurationByTab.get(tabId) === configuration) this.configurationByTab.delete(tabId);
    }).catch(() => {});
    return configuration;
  }
  async handleRequest(tabId: number, request: PausedRequest) {
    const entries = [...(this.requestInterceptorsByTab.get(tabId) ?? [])];
    const pending = entries.some((entry) => entry.pendingRequests != null) ? Promise.withResolvers<void>() : undefined;
    if (pending != null) for (const entry of entries) entry.pendingRequests?.add(pending.promise);
    let resolution = "blocked";
    try {
      for (const { interceptor } of entries) {
        let result;
        try { result = await interceptor(request); } catch { result = "block"; }
        if (result === "handled") { resolution = "handled"; return; }
        if (result === "block") {
          await this.cdp.call(tabId, "Fetch.failRequest", { requestId: request.requestId, errorReason: "BlockedByClient" }, preserveDebugger);
          return;
        }
      }
      await this.cdp.call(tabId, "Fetch.continueRequest", { requestId: request.requestId }, preserveDebugger);
      resolution = "released";
    } finally {
      if (pending != null) {
        pending.resolve(undefined);
        for (const entry of entries) entry.pendingRequests?.delete(pending.promise);
      }
      this.emit("requestResolution", tabId, request, resolution);
    }
  }
  release(tabId: number, requestId: string) {
    const owned = this.ownedResponsesByTab.get(tabId);
    if (owned != null) {
      owned.delete(requestId);
      if (owned.size === 0) this.ownedResponsesByTab.delete(tabId);
    }
  }
}

export interface KernelCloudApi {
  signal: AbortSignal;
  account: { structure: string };
  request(path: string, init?: RequestInit): Promise<any>;
}
/** Original $g; parser remains explicit until its bundled TOML dependency is identified. */
export function createCloudRequirementsClientClass<Result>(
  parse: (value: unknown) => Result,
) {
  return class CloudRequirementsClient {
    pending?: Promise<Result>;
    lastGood?: Result;
    nextRefreshAt = 0;
    constructor(public chatApi: KernelCloudApi) {}
    async readRequirements(): Promise<Result | { requirements: null }> {
      this.chatApi.signal.throwIfAborted();
      if (this.chatApi.account.structure === "personal")
        return { requirements: null };
      if (this.pending == null) {
        if (this.lastGood != null && Date.now() < this.nextRefreshAt)
          return this.lastGood;
        this.pending = this.fetchRequirements().finally(() => {
          this.pending = undefined;
        });
      }
      const result = await this.pending;
      this.chatApi.signal.throwIfAborted();
      return result;
    }
    async fetchRequirements() {
      try {
        const result = parse(await this.chatApi.request("/wham/config/bundle"));
        this.chatApi.signal.throwIfAborted();
        this.lastGood = result;
        this.nextRefreshAt = Date.now() + 3600000;
        return result;
      } catch (error) {
        this.chatApi.signal.throwIfAborted();
        if (this.lastGood != null) {
          this.nextRefreshAt = Date.now() + 3600000;
          return this.lastGood;
        }
        throw error;
      }
    }
  };
}
/** Original jg. Forced reads and patches queue after any pending request. */
export class CloudBrowserSettingsClient {
  cached: any;
  expiresAt = 0;
  pending?: Promise<any>;
  constructor(public chatApi: KernelCloudApi) {}
  async read(force = false) {
    this.chatApi.signal.throwIfAborted();
    if (!force && this.pending != null) return this.pending;
    if (!force && this.cached != null && Date.now() < this.expiresAt)
      return this.cached;
    return this.request();
  }
  patch(value: unknown, signal: AbortSignal) {
    return this.request({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
      signal,
    });
  }
  request(init?: RequestInit) {
    const pending = (this.pending ?? Promise.resolve())
      .catch(() => {})
      .then(() => this.chatApi.request("/wham/browser/settings", init))
      .then((response) => {
        const settings = {
          ...response,
          rules: { ...response.rules, webmcp: response.rules.webmcp ?? {} },
        };
        this.cached = settings;
        this.expiresAt = Date.now() + 900000;
        return settings;
      })
      .catch((error) => {
        this.cached = undefined;
        throw error;
      })
      .finally(() => {
        if (this.pending === pending) this.pending = undefined;
      });
    this.pending = pending;
    return pending;
  }
}

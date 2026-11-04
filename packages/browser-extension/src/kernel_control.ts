import { createBrowserRpcPeerClass, type BrowserRpcTransport } from "@core/core/browserRpcPeer";
import { CloudRequirementsClient, CloudBrowserSettingsClient, type KernelCloudApi } from "./cloud_clients";
import { createKernelFetchController, type KernelFetchScope } from "./kernel_fetch";
import { createKernelElicitation, isKernelRecord, type KernelElicitationScope } from "./kernel_elicitation";
import { createKernelOutputWriter, type KernelOutput } from "./kernel_scope";

export interface KernelControlScope<Pdf> extends KernelElicitationScope {
  chatApi: KernelCloudApi & KernelFetchScope["chatApi"];
  disposalSignal: AbortSignal;
  content: KernelOutput[];
  onPdfUploaded?: (pdf: Pdf) => void;
}
export interface KernelControlHost<Pdf> {
  getScope(id: string): KernelControlScope<Pdf>;
  siteStatusUrl: URL;
  fetch: typeof globalThis.fetch;
  defaultAllowedPages: string[];
  getConfig(name: string): Promise<{ get(key: string, fallback: unknown): unknown } | undefined>;
  isEnabled(name: string): Promise<boolean>;
  storage: {
    get(key: string): Promise<Record<string, unknown>>;
    set(values: Record<string, unknown>): Promise<void>;
  };
  capturePdf(params: unknown, chatApi: KernelControlScope<Pdf>["chatApi"], signal: AbortSignal): Promise<Pdf | null | undefined>;
  deletePdf(chatApi: KernelControlScope<Pdf>["chatApi"], pdf: Pdf): Promise<unknown>;
}
/** Original Ds. Browser/PDF/feature services are explicit runtime dependencies, not stubs. */
export function createKernelControlClass<Pdf>(host: KernelControlHost<Pdf>) {
  return class KernelControl {
    readonly fetchController;
    readonly output;
    readonly elicitation;
    readonly fetches;
    cloudClients?: {
      chatApi: KernelCloudApi;
      requirements: InstanceType<typeof CloudRequirementsClient>;
      browserSettings: CloudBrowserSettingsClient;
    };
    constructor(public scopeId: string) {
      this.fetchController = createKernelFetchController(scopeId, host);
      this.fetches = this.fetchController.fetches;
      this.output = createKernelOutputWriter(scopeId, host.getScope);
      this.elicitation = createKernelElicitation(scopeId, host.getScope);
    }
    static dispose(control: KernelControl) { control.fetchController.dispose(); }
    static async refreshBrowserSettings(control: KernelControl) {
      await control.cloudClients?.browserSettings.read(true);
    }
    async fetch(params: Parameters<typeof this.fetchController.fetch>[0]) { return this.fetchController.fetch(params); }
    abortFetch(id: unknown) { this.fetchController.abortFetch(id); }
    async getChatGptAccessPolicy() {
      const { signal } = host.getScope(this.scopeId);
      const config = await host.getConfig("browser-extension-chatgpt-access").catch(() => {});
      signal.throwIfAborted();
      const pages = config?.get("allowed_pages", host.defaultAllowedPages);
      return {
        allow_all_chatgpt_pages: config?.get("allow_all_chatgpt_pages", false) === true,
        allowed_pages: Array.isArray(pages) && pages.every(page => typeof page === "string") ? pages : host.defaultAllowedPages,
      };
    }
    async isBrowserElicitationEnabled() {
      const { signal } = host.getScope(this.scopeId);
      const enabled = await host.isEnabled("chatgpt-work-browser-elicitation").catch(() => false);
      signal.throwIfAborted();
      return enabled;
    }
    async captureTabPdfToLibrary(params: unknown) {
      const scope = host.getScope(this.scopeId);
      if (!scope.onPdfUploaded) throw new Error("PDF capture requires turn-scoped cleanup");
      const pdf = await host.capturePdf(params, scope.chatApi, AbortSignal.any([scope.signal, scope.disposalSignal]));
      if (pdf == null) return null;
      try {
        scope.signal.throwIfAborted();
        scope.disposalSignal.throwIfAborted();
        scope.onPdfUploaded(pdf);
        return pdf;
      } catch (error) {
        await host.deletePdf(scope.chatApi, pdf).catch(() => {});
        throw error;
      }
    }
    async readRequirements() {
      const { chatApi, signal } = host.getScope(this.scopeId);
      const result = await this.#clients(chatApi).requirements.readRequirements();
      signal.throwIfAborted();
      return result;
    }
    async readSessionConfig(sessionId: string) {
      const { signal } = host.getScope(this.scopeId);
      const key = `browser-use-session-config:${sessionId}`;
      const values = await host.storage.get(key);
      signal.throwIfAborted();
      return isKernelRecord(values[key]) ? values[key] : {};
    }
    async writeSessionConfig({ sessionId, config }: { sessionId: string; config: unknown }) {
      const { signal } = host.getScope(this.scopeId);
      if (!isKernelRecord(config)) throw new Error("Browser-use session config must be an object");
      await host.storage.set({ [`browser-use-session-config:${sessionId}`]: config });
      signal.throwIfAborted();
    }
    async readBrowserSettings(force?: boolean) {
      const { chatApi, signal } = host.getScope(this.scopeId);
      const result = await this.#clients(chatApi).browserSettings.read(force);
      signal.throwIfAborted();
      return result;
    }
    async patchBrowserSettings(params: unknown) {
      const { chatApi, signal } = host.getScope(this.scopeId);
      const result = await this.#clients(chatApi).browserSettings.patch(params, signal);
      signal.throwIfAborted();
      return result;
    }
    #clients(chatApi: KernelCloudApi) {
      if (this.cloudClients?.chatApi !== chatApi) this.cloudClients = {
        chatApi,
        requirements: new CloudRequirementsClient(chatApi),
        browserSettings: new CloudBrowserSettingsClient(chatApi),
      };
      return this.cloudClients;
    }
    async createElicitation(params: Parameters<typeof this.elicitation>[0]) { return this.elicitation(params); }
    displayValue(value: unknown) { this.output.displayValue(value); }
    displayImage(data: string) { this.output.displayImage(data); }
  };
}
const KernelRpcPeer = createBrowserRpcPeerClass(false);
/** Original qg; a transport close aborts outstanding control fetches. */
export class KernelControlPeer extends KernelRpcPeer {
  constructor(transport: BrowserRpcTransport & { addCloseListener?(listener: () => void): unknown }, control: object & { fetches: Map<unknown, AbortController> }) {
    super(transport);
    this.registerRequestHandlerObject(control);
    transport.addCloseListener?.(() => {
      for (const controller of control.fetches.values()) controller.abort();
      control.fetches.clear();
    });
  }
  sendTurnEnded(params: unknown) { return this.sendRequest("turnEnded", params); }
}

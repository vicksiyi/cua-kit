import { kernelBrowserService } from "./kernel_browser_service";
import { kernelErrorReporter, kernelCommandTiming, kernelPerformanceSpan } from "./kernel_instrumentation";
import { BrowserApi, codexTurnMetadata } from "@core/browser/kernelBrowserApi";
import { KernelControlClient } from "./kernel_control_client";
import { createKernelExecutionRuntime } from "./kernel_execution_runtime";
import { createKernelGlobalConfig, createKernelSessionConfig, type KernelConfigLocks } from "./kernel_config";
import { splitKernelTransport, type KernelTransport } from "./kernel_transport";
import { encodeKernelBytes } from "./kernel_fetch";
import type { KernelBrowserBridge } from "./kernel_frame_host";
/** Original DU, reusing the corresponding reconstructed xU/id BrowserApi. */
export class KernelBrowserContext {
  connection: { id: string; api: BrowserApi; info: any } | null = null;
  api: BrowserApi;
  constructor(transport: KernelTransport, runtime: ReturnType<typeof createKernelExecutionRuntime>, readRequirements: KernelControlClient["readRequirements"]) {
    this.api = new BrowserApi(transport, { ping() { return "pong"; } }, () => codexTurnMetadata(runtime), undefined,
      async () => (await readRequirements()).requirements?.browserUse?.extension?.requestHeaders, undefined, undefined);
  }
  async list() {
    const { id, info } = await this.getOrInitializeBrowserConnection();
    const type = ["extension", "iab", "mcpapps", "cdp"].includes(info.type) ? info.type : undefined;
    return [{ family: info.family, id, name: info.name, type, profileName: info.metadata?.profileName,
      metadata: info.metadata == null ? undefined : { extensionInstanceId: info.metadata.extensionInstanceId, codexSessionId: info.metadata.codexSessionId } }];
  }
  get(id: string) { if (id !== "0" && id !== "extension") throw new Error("Browser with id " + id + " not found"); return this.getOrInitializeBrowserConnection(); }
  getDefault() { return this.getOrInitializeBrowserConnection(); }
  getForUrl() { return this.getOrInitializeBrowserConnection(); }
  refresh() { return Promise.resolve(); }
  preferredWindowIdFor() {}
  dispose() { return this.api.close(); }
  turnEnded(params: any) { return this.api.turnEnded(params); }
  async getOrInitializeBrowserConnection() {
    return this.connection ? this.connection : this.connection = { id: "0", api: this.api, info: await this.api.getInfo() };
  }
}
export interface KernelBrowserRuntimeServices {
  platform: "darwin" | "win32" | "linux";
  locks: KernelConfigLocks;
  commandTiming?: unknown;
  errorReporter?: unknown;
  performanceSpan?: unknown;
}
/** Original qU. Filesystem behavior is intentionally the source's extension-only behavior. */
export function createKernelBrowserRuntime(transport: KernelTransport, services: KernelBrowserRuntimeServices) {
  const { browserTransport, controlTransport } = splitKernelTransport(transport);
  const control = new KernelControlClient(controlTransport, { turnEnded: (params: any) => browserContext.turnEnded(params) });
  const runtime = createKernelExecutionRuntime(control, services.platform);
  const browserContext = new KernelBrowserContext(browserTransport, runtime, control.readRequirements);
  return Object.assign(runtime, {
    browserContext,
    commandTiming: services.commandTiming ?? kernelCommandTiming,
    config: {
      readAll() { return Promise.resolve(null); },
      global: createKernelGlobalConfig(control, services.locks),
      readRequirements: control.readRequirements,
      session(sessionId: string) { return createKernelSessionConfig(control, sessionId, services.locks); },
    },
    displayBridge: { displayImage: (bytes: Uint8Array) => control.displayImage(encodeKernelBytes(bytes)), displayValue: control.displayValue },
    errorReporter: services.errorReporter ?? kernelErrorReporter,
    filesystem: {
      mkdir() { return Promise.resolve(); }, readFile() { return Promise.resolve(""); },
      readBytes() { return Promise.reject(new Error("Binary filesystem reads are unavailable in the extension")); },
      rm() { return Promise.resolve(); }, tmpDir: "", writeFile() { return Promise.resolve(); },
    },
    performanceSpan: services.performanceSpan ?? kernelPerformanceSpan,
  });
}
/** Original jU; initialize before creating the actual browser service. */
export function createKernelBrowserBridge(
  transport: KernelTransport,
  metadata: unknown,
  services: KernelBrowserRuntimeServices & {
    createBrowserService?(runtime: ReturnType<typeof createKernelBrowserRuntime>): KernelBrowserBridge["browser"];
  },
): KernelBrowserBridge {
  const runtime = createKernelBrowserRuntime(transport, services);
  runtime.beginExecution(metadata);
  const browser = runtime.initialize().then(() => (services.createBrowserService ?? kernelBrowserService.createBrowserService)(runtime));
  return {
    browser, displayBridge: runtime.displayBridge, beginExecution: runtime.beginExecution,
    async finishExecution() { await browser; return await runtime.finishExecution(); },
  };
}

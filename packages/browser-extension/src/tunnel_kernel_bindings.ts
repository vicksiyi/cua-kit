import type { BackgroundKernelBindings } from "./background_assembly";
import type { createExtensionBrowserFoundation } from "./browser_foundation";
import {
  createKernelTunnelRuntime,
  deleteKernelLibraryFile,
  type KernelLibraryFile,
} from "./kernel_tunnel_runtime";
import { createTabPdfCapture } from "./tab_pdf_capture";
import { startAssembledBrowserTunnel } from "./tunnel_assembly";
import type { KernelHostServices } from "./kernel_host";

/** Connect the background control RPC and tunnel to the same scope/host registry.
 * Construction is inert: registerTurnEnded is called only by the original kernel
 * gate in registerBackgroundKernel. Auth, consent and gate behavior are unchanged.
 */
export function createTunnelKernelBindings(options: {
  foundation: ReturnType<typeof createExtensionBrowserFoundation>;
  chrome: typeof chrome;
  kernelHost: KernelHostServices;
  browserShortDisplayName(): string;
  environment: Parameters<typeof startAssembledBrowserTunnel>[0]["environment"];
  reportSetup: Parameters<typeof startAssembledBrowserTunnel>[0]["reportSetup"];
  reportIdle(): void;
  siteStatusUrl: URL;
  defaultAllowedPages: string[];
  setInterval: typeof globalThis.setInterval;
  clearInterval: typeof globalThis.clearInterval;
}): BackgroundKernelBindings<KernelLibraryFile> {
  const { foundation, chrome: browser, environment } = options;
  const runtime = createKernelTunnelRuntime({
    ChatApi: foundation.ChatApi,
    kernelHost: options.kernelHost,
    storage: browser.storage.sync,
    browserShortDisplayName: options.browserShortDisplayName,
    randomUUID: () => environment.randomUUID(),
    warn: (message) => environment.warn(message),
  });
  const pdf = createTabPdfCapture({
    chrome: browser,
    randomUUID: () => environment.randomUUID(),
    setInterval: options.setInterval,
    clearInterval: options.clearInterval,
    fetch: environment.fetch,
  });
  return {
    getScope: runtime.getScope,
    siteStatusUrl: options.siteStatusUrl,
    defaultAllowedPages: options.defaultAllowedPages,
    // Control's public RPC accepts unknown; the original mg destructures these
    // arguments and validates them in captureToLibrary. Scope APIs originate only
    // from this runtime's actual ChatApi instances.
    capturePdf: (params, api, signal) =>
      pdf.captureToLibrary(
        params as Parameters<typeof pdf.captureToLibrary>[0],
        api as InstanceType<typeof foundation.ChatApi>,
        signal,
      ),
    deletePdf: (api, file) =>
      deleteKernelLibraryFile(
        api as InstanceType<typeof foundation.ChatApi>,
        file,
      ),
    registerTurnEnded: (callback) =>
      startAssembledBrowserTunnel(
        {
          foundation,
          runtime,
          chrome: browser,
          environment,
          reportSetup: options.reportSetup,
          reportIdle: options.reportIdle,
        },
        callback,
      ),
  };
}

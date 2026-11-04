import { registerKernelFrameHost, type KernelFrameHostServices } from "./kernel_frame_host";
import { createKernelBrowserBridge, type KernelBrowserRuntimeServices } from "./kernel_browser_bridge";
import { kernelBrowserService } from "./kernel_browser_service";
/** Original GU entry wiring: real browser service, bridge and shared cleanup. */
export function registerAssembledKernelFrameHost(
  host: Omit<KernelFrameHostServices, "createBrowserBridge" | "cleanupBrowser">,
  services: KernelBrowserRuntimeServices,
) {
  return registerKernelFrameHost({
    ...host,
    createBrowserBridge: (transport, metadata) => createKernelBrowserBridge(transport, metadata, services),
    cleanupBrowser: kernelBrowserService.dispose,
  });
}

import { assembleCommandRuntime } from "@core/browser/kernelBrowserService";
import { kernelDocumentation } from "./kernel_documentation";
import type { createKernelBrowserRuntime } from "./kernel_browser_bridge";
/** Original gU module lifetime: one runtime factory, shared hooks and disposal. */
export function createKernelBrowserServiceFactory() {
  const runtime = assembleCommandRuntime({
    documentation: { moduleUrl: import.meta.url, bundle: kernelDocumentation },
  });
  return {
    createBrowserService(host: ReturnType<typeof createKernelBrowserRuntime>) {
      return runtime.createRuntime({}, host);
    },
    dispose: runtime.dispose,
  };
}

import { assembleBrowserService } from "@core/browser/service";
import { desktopDocumentation } from "./documentation_bundle";
// One dispatcher/runtime closure per module instance, matching the bundled service.
const service = assembleBrowserService({
  runtime: {
    documentation: { moduleUrl: import.meta.url, bundle: desktopDocumentation },
  },
});
export const handleRpc = service.handleRpc;
export { classifyError } from "@core/browser/service";

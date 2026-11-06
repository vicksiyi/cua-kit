/** Independent trusted-host adapter; original desktop service remains unchanged. */
import { assembleBrowserService } from "@core/browser/service";
import { desktopDocumentation } from "@core/browser-desktop/documentation";
import { createBrowserServiceConnector } from "./browser_connector";
import { parseEndpointFiles } from "./endpoint_configuration";

const nativePipe = (globalThis as any).nodeRepl?.nativePipe;
if (typeof nativePipe?.createConnection !== "function")
  throw Error(
    "Independent browser service requires the privileged Node REPL pipe bridge",
  );
const connector = await createBrowserServiceConnector(
  parseEndpointFiles(process.env.CORE_CUA_ENDPOINT_FILES, { allowEmpty: true }),
  (path) => nativePipe.createConnection(path),
);
// Discovery and the authenticated bridge must address the same explicit hosts.
if (
  process.env.BROWSER_USE_BACKEND_PATHS !==
  connector.environment.BROWSER_USE_BACKEND_PATHS
)
  throw Error(
    "Independent browser discovery paths do not match configured endpoints",
  );
const service = assembleBrowserService({
  host: connector.host,
  runtime: {
    documentation: { moduleUrl: import.meta.url, bundle: desktopDocumentation },
  },
});
export const handleRpc = service.handleRpc;
export const dispose = service.dispose;
export { classifyError } from "@core/browser/service";

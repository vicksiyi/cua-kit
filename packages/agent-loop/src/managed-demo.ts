/** User-facing demo entry; same restored MCP/CUA path, automatically provisioned visible browser. */
import { startManagedBrowser } from "./managed-browser";
const configured = JSON.parse(process.env.CUA_MCP_ENV ?? "{}");
if (!configured || typeof configured !== "object" || Array.isArray(configured)) throw Error("CUA_MCP_ENV must be an object");
const browser = await startManagedBrowser();
process.env.CUA_DEMO_MANAGED_BROWSER = "1";
process.env.CORE_CUA_HOST_DIRECTORY = browser.hostDirectory;
delete process.env.CORE_CUA_ENDPOINT_FILES;
configured.CORE_CUA_HOST_DIRECTORY = browser.hostDirectory;
delete configured.CORE_CUA_ENDPOINT_FILES;
process.env.CUA_MCP_ENV = JSON.stringify(configured);
console.error("Managed Chromium connected. This is a temporary separate browser; it closes when the demo exits.");
const stop = () => { void browser.close().finally(() => { process.exitCode = 130; }); };
process.once("SIGINT", stop); process.once("SIGTERM", stop);
try { await import("./restored-demo"); }
finally {
  process.off("SIGINT", stop); process.off("SIGTERM", stop);
  await browser.close();
}

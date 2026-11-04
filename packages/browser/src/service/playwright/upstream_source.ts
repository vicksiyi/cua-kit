import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
let cachedSource: string | undefined;
/** Load the full upstream injected implementation, without launching a browser.
 * This uses a versioned internal asset: fail explicitly if the pinned layout changes.
 * The caller retains the CUA installation/credential-policy adapter.
 */
export function upstreamPlaywrightSource() {
  if (cachedSource !== undefined) return cachedSource;
  const manifestPath = require.resolve("playwright-core/package.json");
  const manifest = require(manifestPath);
  if (manifest.version !== "1.59.1")
    throw new Error(
      `Unsupported Playwright injected version: ${manifest.version}`,
    );
  const { source } = require(
    join(dirname(manifestPath), "lib/generated/injectedScriptSource.js"),
  );
  if (typeof source !== "string" || !source.includes("InjectedScript"))
    throw new Error("Playwright injected source is missing");
  cachedSource = `var PlaywrightInjected = (() => { const module = { exports: {} }; ${source}\nreturn { ...module.exports, InjectedScript: module.exports.InjectedScript() }; })();`;
  return cachedSource;
}

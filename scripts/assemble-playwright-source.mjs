import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
/** Resolve from the browser workspace so a different root Playwright cannot leak in. */
export async function assemblePlaywrightSource() {
  const require = createRequire(new URL("../packages/browser/package.json", import.meta.url));
  const manifestPath = require.resolve("playwright-core/package.json");
  const manifest = require(manifestPath);
  if (manifest.version !== "1.59.1") throw new Error(`Unsupported Playwright injected version: ${manifest.version}`);
  const asset = join(dirname(manifestPath), "lib/generated/injectedScriptSource.js");
  const { source } = require(asset);
  if (typeof source !== "string" || !source.includes("InjectedScript")) throw new Error("Playwright injected source is missing");
  const wrapped = `var PlaywrightInjected = (() => { const module = { exports: {} }; ${source}\nreturn { ...module.exports, InjectedScript: module.exports.InjectedScript() }; })();`;
  const hash = createHash("sha256").update(source).digest("hex");
  const output = new URL("../packages/browser/src/service/playwright/upstream_generated_source.ts", import.meta.url);
  const content = `// Generated from playwright-core 1.59.1, Apache-2.0. Do not edit.\n// https://github.com/microsoft/playwright\n// Upstream injected source SHA-256: ${hash}\nexport const playwrightInjectedSource = ${JSON.stringify(wrapped)};\n`;
  if (await readFile(output, "utf8").catch(() => "") !== content) await writeFile(output, content);
  return { path: fileURLToPath(output), sourceHash: hash, bytes: Buffer.byteLength(wrapped) };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(await assemblePlaywrightSource());

/** Demo convenience: owned Chromium profile with the project's extension, never the daily Chrome profile. */
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium, type BrowserContext } from "playwright";
import { discoverEndpointFiles } from "@core/native-host/browserConnector";
const exec = promisify(execFile);
export async function startManagedBrowser(options: { headless?: boolean } = {}) {
  const root = await mkdtemp("/tmp/core-demo-");
  const profile = join(root, "profile"), installation = join(root, "host");
  let context: BrowserContext | undefined;
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => {
    try { await context?.close(); }
    finally { await rm(root, { recursive: true, force: true }); }
  })();
  try {
    const env: Record<string, string> = { TMPDIR: root };
    for (const key of ["PATH", "HOME", "USER", "LOGNAME", "LANG", "DISPLAY"])
      if (process.env[key]) env[key] = process.env[key]!;
    await exec(process.execPath, [resolve("packages/native-host/dist/install.mjs"), "--root", installation, "--profile", profile], { env, timeout: 15000 });
    const extension = resolve("packages/browser-extension/dist/native-extension");
    context = await chromium.launchPersistentContext(profile, {
      channel: "chromium", headless: options.headless ?? false, env,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    const hostDirectory = join(installation, "endpoints");
    const deadline = Date.now() + 15000;
    while (true) {
      try { await discoverEndpointFiles(hostDirectory); break; }
      catch (error) {
        if (!(error instanceof Error) || !error.message.includes("No independent browser host")) throw error;
        if (Date.now() >= deadline) throw Error("Managed browser extension did not connect within 15 seconds");
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    return { context, hostDirectory, close };
  } catch (error) { await close(); throw error; }
}

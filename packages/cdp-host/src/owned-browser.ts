/** Owned visible Chromium with CDP, no extension, no user's profile. */
import { chromium, type BrowserContext } from "playwright";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { CdpConnection } from "./connection";
export async function startOwnedCdpBrowser(
  options: { headless?: boolean } = {},
) {
  const profile = await mkdtemp("/tmp/core-cdp-");
  let context: BrowserContext | undefined,
    connection: CdpConnection | undefined;
  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= (async () => {
      connection?.close();
      try {
        await context?.close();
      } finally {
        await rm(profile, { recursive: true, force: true });
      }
    })());
  try {
    const env: Record<string, string> = {};
    for (const key of [
      "HOME",
      "PATH",
      "USER",
      "LOGNAME",
      "LANG",
      "DISPLAY",
      "TMPDIR",
    ])
      if (process.env[key]) env[key] = process.env[key]!;
    context = await chromium.launchPersistentContext(profile, {
      channel: "chromium",
      headless: options.headless ?? false,
      env,
      args: [
        "--remote-debugging-address=127.0.0.1",
        "--remote-debugging-port=0",
        "--disable-extensions",
      ],
      serviceWorkers: "block",
    });
    const [port, path] = (
      await readFile(join(profile, "DevToolsActivePort"), "utf8")
    )
      .trim()
      .split("\n");
    if (!port || !/^\d+$/.test(port) || !path?.startsWith("/devtools/browser/"))
      throw Error("Invalid owned browser CDP descriptor");
    const endpoint = `ws://127.0.0.1:${port}${path}`;
    connection = await CdpConnection.connect(endpoint);
    return {
      context,
      connection,
      close,
      endpoint,
      ownership: "owned" as const,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

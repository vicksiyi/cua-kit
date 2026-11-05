/** Attach to an explicitly supplied local debugging endpoint; never owns the browser process. */
import { chromium, type Browser } from "playwright";
import { CdpConnection } from "./connection";
export async function attachCdpBrowser(endpoint: string) {
  // Validate and establish the loopback-only CDP connection before Playwright sees it.
  const connection = await CdpConnection.connect(endpoint);
  let browser: Browser | undefined;
  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= (async () => {
      connection.close();
      // For connectOverCDP, Browser.close disconnects the transport. It does not
      // terminate the external Chromium process; this is verified by a live test.
      await browser?.close();
    })());
  try {
    browser = await chromium.connectOverCDP(endpoint, {
      noDefaults: true,
      timeout: 10000,
    });
    const context = browser.contexts()[0];
    if (!context)
      throw Error("The CDP endpoint has no default browser context");
    return { context, connection, close, ownership: "attached" as const };
  } catch (error) {
    await close();
    throw error;
  }
}

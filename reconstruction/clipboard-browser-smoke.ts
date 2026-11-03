import assert from "node:assert/strict";
import { chromium } from "playwright";
import { CdpEventEmitter } from "../packages/browser/dist/service/cdp/event_emitter.js";
import { BrowserClipboard } from "../packages/browser/dist/service/context/browser_clipboard.js";
// Isolated Chromium verifies the reconstructed clipboard stack, not the unreconstructed production provider.
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("about:blank");
  const session = await context.newCDPSession(page);
  await session.send("Page.enable");
  await session.send("Runtime.enable");
  const cdp = Object.assign(new CdpEventEmitter(), {
    addTabCleanupHandler: (_handler: unknown) => () => {},
    callTarget: async (_target: unknown, method: string, params: any) =>
      session.send(method as any, params),
  });
  session.on("Runtime.bindingCalled", (params) =>
    cdp.emit("event", {
      method: "Runtime.bindingCalled",
      source: { tabId: 1 },
      params,
    }),
  );
  const store = new BrowserClipboard();
  await store.ensurePageClipboard(cdp, { tabId: 1 });
  await page.evaluate(async () => {
    await navigator.clipboard.writeText("reconstructed clipboard");
  });
  assert.equal(
    (store.read()[0].entries[0] as { text: string }).text,
    "reconstructed clipboard",
  );
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    "reconstructed clipboard",
  );
  await page.reload();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    "reconstructed clipboard",
  );
  await store.dispose();
  assert.equal(
    await page.evaluate(() => "__browserUseClipboardBridge" in globalThis),
    false,
  );
  await page.reload();
  assert.equal(
    await page.evaluate(() => "__browserUseClipboardBridge" in globalThis),
    false,
  );
  console.log(
    "PASS: isolated Chromium clipboard write/read, new-document reinjection and cleanup",
  );
} finally {
  await browser.close();
}

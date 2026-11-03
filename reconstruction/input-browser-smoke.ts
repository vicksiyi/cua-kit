// Isolated Chromium integration: real CDP, test-only UI/page-load adapter, no user browser state.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { BrowserInput } from "../packages/browser/src/service/input/index";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(
    '<input id="normal"><div id="host" style="margin-top:40px"></div>',
  );
  await page.evaluate(() => {
    const root = document
      .querySelector("#host")!
      .attachShadow({ mode: "closed" });
    root.innerHTML = '<input id="protected">';
    (window as any).protectedInput = root.querySelector("input");
  });
  const session = await page.context().newCDPSession(page);
  const cdp: any = {
    platform: process.platform,
    call: (_tab: any, method: string, params: any) =>
      session.send(method as any, params),
    callTarget: (_target: any, method: string, params: any) =>
      session.send(method as any, params),
    waitForPageLoadEvent: () => Promise.resolve(),
    addTabCleanupHandler: () => {},
    targetForFrameOrAttach: () => {
      throw new Error("unexpected subframe in smoke fixture");
    },
  };
  const input = new BrowserInput(
    cdp,
    { moveMouse: async () => {} },
    "synthesizeScrollGesture",
    true,
  );
  await page.locator("#normal").focus();
  await input.dispatchKeyPress({
    commandName: "keypress",
    tabId: 1,
    keys: ["a"],
  });
  assert.equal(await page.locator("#normal").inputValue(), "a");
  await page.evaluate(() => (window as any).protectedInput.focus());
  await assert.rejects(
    input.dispatchKeyPress({ commandName: "keypress", tabId: 1, keys: ["b"] }),
    /Cannot send keys into a closed shadow root/,
  );
  assert.equal(
    await page.evaluate(() => (window as any).protectedInput.value),
    "",
  );
  const point = await page.evaluate(() => {
    const box = (window as any).protectedInput.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  await assert.rejects(
    input.clickPoint({ tabId: 1, point, clickCount: 1, modifiers: 0 }),
    /Cannot click content inside a closed shadow root/,
  );
  console.log(
    "PASS: real CDP normal typing; closed-shadow keyboard and pointer actions rejected without changing protected input.",
  );
} finally {
  await browser.close();
}

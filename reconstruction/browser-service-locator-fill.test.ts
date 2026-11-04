import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { EventEmitter } from "node:events";
import { originalServiceBindings, serviceExpression } from "./service-source";
import {
  createTextPaste,
  preserveMarkdownWhitespace,
  inputDocumentKind,
} from "../packages/browser/src/service/input/text_paste";
import { createLocatorFillCommand } from "../packages/browser/src/service/commands/locator_fill";
import { executeClipboardPage } from "../packages/browser/src/service/clipboard/page_execution";
import { pageClipboardOperation } from "../packages/browser/src/service/clipboard/page_operations";
import { BrowserClipboard } from "../packages/browser/src/service/context/browser_clipboard";
import { PlaywrightService } from "../packages/browser/src/service/playwright/service";
// Renderer fixture isolates text/whitespace plumbing; upstream renderer fidelity is covered by browser-service-markdown.test.ts.
const renderer = {
  render(text: string) {
    return `<p>${text.trim()}</p>\n`;
  },
};
const original = originalServiceBindings(
  ["F", "kv", "Hs", "W", "F9", "L9", "U9", "q9", "j9", "r_", "H9"],
  { N9: renderer, yl: executeClipboardPage, Cp: pageClipboardOperation },
);
const paste = createTextPaste(renderer);
async function outcome(run: () => Promise<any>) {
  try {
    return { value: await run() };
  } catch (e) {
    return { error: (e as Error).message.split("\n")[0] };
  }
}
test("text paste preserves original document policy, whitespace and clipboard page options", async () => {
  for (const url of [
    undefined,
    "bad",
    "https://docs.google.com/spreadsheets/",
    "https://docs.google.com/document/",
    "https://docs.google.com:444/spreadsheets/",
    "https://other.test/spreadsheets/",
  ])
    assert.equal(inputDocumentKind(url), original.H9(url));
  for (const text of [
    "",
    " ",
    "\r\n",
    "\t text \n",
    "a\nb",
    "🙂 ",
    "\u2028x\u2029",
  ])
    for (const html of [
      `<p>${text.trim()}</p>\n`,
      "<p>a</p><p>b</p>",
      "<ul><li>a</li></ul>",
    ])
      assert.equal(
        preserveMarkdownWhitespace(html, text),
        original.j9(html, text),
      );
  for (const scenario of ["plain", "rich", "sheets", "context", "invalid"]) {
    async function run(restored: boolean) {
      const calls: any[] = [],
        context: any = {
          tabs: {
            async get(tab: any) {
              calls.push(["tab", tab]);
              return {
                url:
                  scenario === "sheets"
                    ? "https://docs.google.com/spreadsheets/"
                    : "https://example.test",
              };
            },
          },
          playwright: { executionPolicy: { documentOnly: true } },
          clipboard: {
            async runExclusive(run: any) {
              calls.push("lock");
              await run();
              calls.push("unlock");
            },
            async ensurePageClipboard(_cdp: any, target: any) {
              calls.push(["ensure", target]);
            },
          },
          cdp: {
            async callTarget(...args: any[]) {
              calls.push(["cdp", ...args]);
              return { result: { value: { ok: true, data: {} } } };
            },
          },
        };
      const request: any = {
        tab_id: 1,
        text: scenario === "invalid" ? 1 : " hello \n",
        includeRichText: scenario === "plain" ? false : undefined,
        executionContextId: scenario === "context" ? 7 : undefined,
        target:
          scenario === "context" ? { tabId: 1, sessionId: "child" } : undefined,
        inputTargetToken: "token",
        replaceInputValue: true,
      };
      return {
        result: await outcome(() =>
          (restored ? paste.typeText : original.Hs)(request, context, "fill"),
        ),
        calls,
      };
    }
    assert.deepEqual(await run(true), await run(false), scenario);
  }
});
test("fill command preserves authority, append/replace and helper-done paths", async () => {
  for (const scenario of ["replace", "append", "done", "invalid", "denied"]) {
    async function run(restored: boolean) {
      const calls: any[] = [],
        context: any = {
          acquireAuthority() {
            calls.push("authority");
            return {
              actInFrame() {
                return {
                  async assert() {
                    calls.push("assert");
                    if (scenario === "denied") throw Error("denied");
                  },
                };
              },
            };
          },
          security: {
            async currentTabUrl() {
              return "url";
            },
          },
          async followSessionTab() {
            calls.push("follow");
          },
          playwright: {
            async prepareLocatorFill(...args: any[]) {
              calls.push(["prepare", ...args]);
              return {
                result: scenario === "done" ? "done" : "needsinput",
                target: { tabId: 1 },
              };
            },
            async focusLocator(...args: any[]) {
              calls.push(["focus", ...args]);
              return { target: { tabId: 1 } };
            },
          },
        };
      const typeText = async (...args: any[]) => {
        calls.push(["type", args[0], args[2]]);
      };
      const source = originalServiceBindings(["F", "kv"], { Hs: typeText });
      const command = restored ? createLocatorFillCommand(typeText) : source.kv;
      return {
        result: await outcome(() =>
          command(
            {
              tab_id: 1,
              selector: "input",
              value: scenario === "invalid" ? 0 : "text",
              replace: scenario === "append" ? false : undefined,
            },
            context,
          ),
        ),
        calls,
      };
    }
    assert.deepEqual(await run(true), await run(false), scenario);
  }
});
test("assembled fill replaces/appends actual text and completes date fill via existing helper", async () => {
  const browser = await chromium.launch({ headless: true }),
    source = new Function(`return (${serviceExpression("hF")})`)();
  try {
    async function run(restored: boolean) {
      const page = await browser.newPage(),
        clipboard = new BrowserClipboard();
      let cdp: any;
      try {
        await page.setContent(
          "<input id=plain value=old><input id=date type=date>",
        );
        const session = await page.context().newCDPSession(page);
        cdp = new EventEmitter();
        cdp.platform = "linux";
        cdp.addTabCleanupHandler = () => () => {};
        cdp.callTarget = async (_target: any, method: string, params: any) =>
          session.send(method as any, params);
        cdp.targetForFrameOrAttach = async () => undefined;
        const service = new PlaywrightService(
          cdp,
          source,
          {
            startLocatorRetry() {
              return { finish() {}, attemptFailed() {} };
            },
          },
          { currentPlaywrightOperation: () => "fill" },
          {
            async clickPoint() {
              throw Error("unused");
            },
          },
        );
        const context: any = {
          cdp,
          clipboard,
          playwright: service,
          tabs: {
            async get() {
              throw Error("plain fill must not request rich-text tab policy");
            },
          },
          acquireAuthority() {
            return {
              actInFrame() {
                return { async assert() {} };
              },
            };
          },
          security: {
            async currentTabUrl() {
              return "about:blank";
            },
          },
          async followSessionTab() {},
        };
        const command = restored
          ? createLocatorFillCommand(paste.typeText)
          : original.kv;
        await command(
          { tab_id: 1, selector: "#plain", value: "hello" },
          context,
        );
        await command(
          { tab_id: 1, selector: "#plain", value: " 中🙂", replace: false },
          context,
        );
        await command(
          { tab_id: 1, selector: "#date", value: "2026-11-04" },
          context,
        );
        return await page
          .locator("input")
          .evaluateAll((inputs) => inputs.map((input) => input.value));
      } finally {
        if (cdp) await clipboard.disposePageClipboard(cdp);
        await page.close();
      }
    }
    const actual = await run(true);
    assert.deepEqual(actual, await run(false));
    assert.deepEqual(actual, ["hello 中🙂", "2026-11-04"]);
  } finally {
    await browser.close();
  }
});

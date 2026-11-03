import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { originalServiceBindings } from "./service-source";
import { positiveTabId } from "../packages/browser/src/service/tab_id";
import { clipboardKeys } from "../packages/browser/src/service/input/keyboard_dispatch";
import { clipboardShortcutError } from "../packages/browser/src/service/input/keyboard_keys";
import { resolveClipboardFocus } from "../packages/browser/src/service/clipboard/focused_frame";
import {
  executeClipboardPage,
  credentialFieldPolicy,
} from "../packages/browser/src/service/clipboard/page_execution";
import {
  runClipboardOperation,
  dispatchClipboardKeypress,
} from "../packages/browser/src/service/clipboard/operations";
import { createClipboardClass } from "../packages/browser/src/service/context/clipboard";
import { createPageActionDispatcher } from "../packages/browser/src/service/accessibility/page_actions";
const original = originalServiceBindings(["Cp", "KA", "Zy", "oo"], {
  W: positiveTabId,
  Ep: clipboardKeys,
  di: clipboardShortcutError,
  j5: resolveClipboardFocus,
  yl: executeClipboardPage,
  no: credentialFieldPolicy,
});

test("clipboard orchestration matches original through real page execution and reconstructed store", async () => {
  const browser = await chromium.launch({ headless: true });
  const mixed = [
    {
      entries: [
        { mime_type: "text/plain", text: "new" },
        { mime_type: "text/html", text: "<b>new</b>" },
      ],
    },
    { entries: [{ mime_type: "image/png", base64: "AA==" }] },
  ];
  const cases = [
    { action: "copy" },
    { action: "cut" },
    { action: "cut", failWrite: true },
    { action: "paste" },
    { action: "paste-plain-text" },
    {
      action: "paste",
      items: [{ entries: [{ mime_type: "text/plain", text: "provided" }] }],
    },
    { action: "unsupported" },
    { action: "copy", tabId: 0 },
    { keypress: "Control+c" },
    { keypress: "Control+v" },
    { keypress: "ArrowRight" },
    { keypress: "Control+Shift+v" },
    { action: "copy", failFocus: true },
    { action: "paste", empty: true },
  ];
  try {
    for (const scenario of cases) {
      async function run(restored: boolean) {
        const page = await browser.newPage();
        const trace: any[] = [];
        try {
          await page.setContent('<input value="abcdef">');
          await page.locator("input").focus();
          await page.evaluate(() => {
            const input = document.querySelector("input")!;
            input.setSelectionRange(1, 4);
          });
          const cdpSession = await page.context().newCDPSession(page);
          const Store = createClipboardClass(
            class {
              constructor(..._args: any[]) {}
              async ensure() {
                trace.push("ensure");
              }
              async cleanup() {}
              async dispose() {}
            },
          );
          const clipboard = new Store();
          if (!scenario.empty) clipboard.write(mixed, "seed");
          const write = clipboard.write.bind(clipboard);
          clipboard.write = (items, operation) => {
            trace.push(["write", items, operation]);
            if (scenario.failWrite) throw Error("host write failed");
            write(items, operation);
          };
          const ctx: any = {
            clipboard,
            cdp: {
              platform: "linux",
              callTarget: async (_target: any, method: string, params: any) =>
                cdpSession.send(method as any, params),
              targetForFrameOrAttach: async () => undefined,
            },
          };
          const request: any = {
            action: scenario.action,
            keypress: scenario.keypress,
            items: scenario.items,
            tabId: scenario.tabId ?? "1",
            commandType: "test",
            ctx,
            focusTarget: async (editable: boolean) => {
              trace.push(["focus", editable]);
              if (scenario.failFocus) throw Error("focus failed");
              return { target: { tabId: 1 } };
            },
          };
          let result, error;
          try {
            result = await (
              scenario.keypress
                ? restored
                  ? dispatchClipboardKeypress
                  : original.oo
                : restored
                  ? runClipboardOperation
                  : original.Zy
            )(request);
          } catch (e: any) {
            error = e.message;
          }
          return {
            result,
            error,
            trace,
            items: clipboard.read(),
            page: await page.evaluate(() => ({
              value: document.querySelector("input")!.value,
              pending: !!(globalThis as any).__browserUsePendingCut,
            })),
          };
        } finally {
          await page.close();
        }
      }
      const expected = await run(false),
        actual = await run(true);
      assert.deepEqual(actual, expected, JSON.stringify(scenario));
      if (scenario.action === "cut")
        assert.equal(actual.page.value, scenario.failWrite ? "abcdef" : "aef");
    }
  } finally {
    await browser.close();
  }
});

test("AX dispatcher defaults to real clipboard path and preserves store-before-commit ordering", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<input value="abcdef">');
    await page.locator("input").focus();
    await page.evaluate(() =>
      document.querySelector("input")!.setSelectionRange(1, 4),
    );
    const session = await page.context().newCDPSession(page);
    const Store = createClipboardClass(
      class {
        async ensure() {}
        async cleanup() {}
        async dispose() {}
      },
    );
    const clipboard = new Store();
    const ctx: any = {
      clipboard,
      cdp: {
        platform: "linux",
        callTarget: async (_t: any, m: string, p: any) =>
          session.send(m as any, p),
        targetForFrameOrAttach: async () => undefined,
      },
    };
    const dispatch = createPageActionDispatcher();
    await dispatch(
      ctx,
      1,
      { kind: "press_key", key: "Control+x" },
      new AbortController().signal,
    );
    assert.equal(await page.locator("input").inputValue(), "aef");
    assert.equal((clipboard.read()[0].entries[0] as any).text, "bcd");
    await dispatch(
      ctx,
      1,
      { kind: "paste", text: "restored" },
      new AbortController().signal,
    );
    assert.equal(await page.locator("input").inputValue(), "arestoredef");
  } finally {
    await browser.close();
  }
});

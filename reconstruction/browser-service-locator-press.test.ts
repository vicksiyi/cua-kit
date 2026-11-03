import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { chromium } from "playwright";
import { originalServiceBindings, serviceExpression } from "./service-source";
import { PlaywrightLocatorPressCommand } from "../packages/browser/src/service/commands/locator_press";
import { dispatchClipboardKeypress } from "../packages/browser/src/service/clipboard/operations";
import { keyboardDispatch } from "../packages/browser/src/service/input";
import { BrowserClipboard } from "../packages/browser/src/service/context/browser_clipboard";
import { PlaywrightService } from "../packages/browser/src/service/playwright/service";
const original = originalServiceBindings(["F", "zD", "Af", "W", "Ve"], {
  oo: dispatchClipboardKeypress,
  Os: (...args: any[]) => (keyboardDispatch.dispatchKeys as any)(...args),
});
async function outcome(run: () => Promise<any>) {
  try {
    return { value: await run() };
  } catch (e) {
    return { error: (e as Error).message.split("\n")[0] };
  }
}
test("locator press preserves authority/follow/validation/focus and key options", async () => {
  const dispatch = keyboardDispatch.dispatchKeys,
    now = Date.now;
  Date.now = () => 1000;
  try {
    for (const scenario of [
      "normal",
      "denied",
      "invalid",
      "bad-tab",
      "focus-error",
      "key-error",
      "blocked-clipboard",
    ]) {
      async function run(restored: boolean) {
        const calls: any[] = [];
        keyboardDispatch.dispatchKeys = (async (...args: any[]) => {
          calls.push(["keys", ...args.slice(1)]);
          if (scenario === "key-error") throw Error("key failed");
        }) as any;
        const context: any = {
          cdp: { platform: "linux" },
          acquireAuthority() {
            calls.push("authority");
            return {
              actInFrame(url: any) {
                calls.push(["act", url]);
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
            async currentTabUrl(tab: any) {
              calls.push(["url", tab]);
              return "url";
            },
          },
          async followSessionTab(tab: any) {
            calls.push(["follow", tab]);
          },
          playwright: {
            async focusLocator(...args: any[]) {
              calls.push(["focus", ...args]);
              if (scenario === "focus-error") throw Error("focus failed");
              return {
                target: { tabId: 1, sessionId: "child" },
                executionContextId: 7,
                inputTargetToken: "token",
                blockClosedShadowInput: true,
              };
            },
          },
        };
        const payload: any = {
          tab_id: scenario === "bad-tab" ? 0 : 1,
          selector: "input",
          timeout_ms: 45,
          value:
            scenario === "invalid"
              ? ""
              : scenario === "blocked-clipboard"
                ? "Shift+Insert"
                : "ArrowLeft",
        };
        return {
          result: await outcome(() =>
            (restored ? PlaywrightLocatorPressCommand : original.zD)(
              payload,
              context,
            ),
          ),
          calls,
        };
      }
      assert.deepEqual(await run(true), await run(false), scenario);
    }
  } finally {
    keyboardDispatch.dispatchKeys = dispatch;
    Date.now = now;
  }
});
test("assembled locator press performs native editing and virtual clipboard copy/paste in Chromium", async () => {
  const browser = await chromium.launch({ headless: true }),
    source = new Function(`return (${serviceExpression("hF")})`)();
  try {
    async function run(restored: boolean) {
      const page = await browser.newPage(),
        clipboard = new BrowserClipboard();
      let cdp: any;
      try {
        await page.setContent(
          "<input id=source value=abcdef><input id=destination>",
        );
        const session = await page.context().newCDPSession(page);
        cdp = new EventEmitter();
        cdp.platform = "linux";
        cdp.addTabCleanupHandler = () => () => {};
        cdp.targetForFrameOrAttach = async () => undefined;
        cdp.call = async (_tab: any, method: string, params: any) =>
          session.send(method as any, params);
        cdp.callTarget = async (_target: any, method: string, params: any) =>
          session.send(method as any, params);
        session.on("Runtime.bindingCalled", (params) =>
          cdp.emit("event", {
            method: "Runtime.bindingCalled",
            params,
            source: { tabId: 1 },
          }),
        );
        const service = new PlaywrightService(
          cdp,
          source,
          {
            startLocatorRetry() {
              return { finish() {}, attemptFailed() {} };
            },
          },
          { currentPlaywrightOperation: () => "press" },
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
        const command = restored ? PlaywrightLocatorPressCommand : original.zD;
        await command(
          { tab_id: 1, selector: "#source", value: "Control+a" },
          context,
        );
        await command(
          { tab_id: 1, selector: "#source", value: "Control+c" },
          context,
        );
        await command(
          { tab_id: 1, selector: "#destination", value: "Control+v" },
          context,
        );
        await command(
          { tab_id: 1, selector: "#destination", value: "Backspace" },
          context,
        );
        return {
          values: await page
            .locator("input")
            .evaluateAll((inputs) => inputs.map((input) => input.value)),
          clipboard: clipboard.read(),
        };
      } finally {
        if (cdp) await clipboard.disposePageClipboard(cdp);
        await page.close();
      }
    }
    const actual = await run(true);
    assert.deepEqual(actual, await run(false));
    assert.deepEqual(actual.values, ["abcdef", "abcde"]);
    assert.equal(actual.clipboard[0].entries[0].text, "abcdef");
  } finally {
    await browser.close();
  }
});

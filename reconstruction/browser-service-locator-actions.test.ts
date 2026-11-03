import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { originalServiceBindings, serviceExpression } from "./service-source";
import {
  PlaywrightLocatorSelectOptionCommand,
  PlaywrightLocatorSetCheckedCommand,
  PlaywrightLocatorPressSequentiallyCommand,
} from "../packages/browser/src/service/commands/locator_actions";
import { keyboardDispatch } from "../packages/browser/src/service/input";
import { PlaywrightService } from "../packages/browser/src/service/playwright/service";
const original = originalServiceBindings(
  ["F", "b2", "y2", "g2", "Qte", "Ve", "h2", "Zte"],
  {
    zA: (...args: any[]) =>
      (keyboardDispatch.dispatchTextCharacter as any)(...args),
  },
);
async function outcome(run: () => Promise<any>) {
  try {
    return { value: await run() };
  } catch (e) {
    return { error: (e as Error).message.split("\n")[0] };
  }
}
test("locator action commands preserve authority, no-op, validation and checked-state confirmation", async () => {
  for (const kind of ["select", "check"])
    for (const scenario of [
      "normal",
      "denied",
      "invalid",
      "unchanged",
      "radio",
      "disabled",
      "disconnected",
      "error",
    ]) {
      async function run(restored: boolean) {
        const calls: any[] = [];
        let reads = 0;
        const context: any = {
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
            async readCheckedState() {
              calls.push("read");
              return {
                checked:
                  scenario === "unchanged"
                    ? true
                    : scenario === "radio"
                      ? true
                      : scenario === "error"
                        ? false
                        : reads++ > 0,
                isRadio: scenario === "radio",
              };
            },
            async clickLocator(...args: any[]) {
              calls.push(["click", ...args]);
            },
            async evaluateOnPlaywrightSelector(
              tab: any,
              selector: any,
              callback: any,
              options: any,
            ) {
              calls.push(["evaluate", tab, selector, options]);
              return callback(
                {},
                {
                  elementState() {
                    return {
                      matches: scenario !== "disabled",
                      received:
                        scenario === "disconnected"
                          ? "error:notconnected"
                          : undefined,
                    };
                  },
                  selectOptions(_element: any, selections: any) {
                    calls.push(["select", selections]);
                    return scenario === "error" ? "error:nooption" : ["b"];
                  },
                },
                options.arg,
              );
            },
          },
        };
        const payload: any = {
          tab_id: 1,
          selector: "input",
          checked: scenario === "invalid" ? "true" : scenario !== "radio",
          selections: [{ value: "b" }],
        };
        const command =
          kind === "select"
            ? restored
              ? PlaywrightLocatorSelectOptionCommand
              : original.b2
            : restored
              ? PlaywrightLocatorSetCheckedCommand
              : original.y2;
        return {
          result: await outcome(() => command(payload, context)),
          calls,
        };
      }
      assert.deepEqual(
        await run(true),
        await run(false),
        `${kind}:${scenario}`,
      );
    }
});
test("sequential typing preserves Unicode iteration, target identity, delay and finally cleanup", async () => {
  const dispatch = keyboardDispatch.dispatchTextCharacter,
    now = Date.now,
    timer = globalThis.setTimeout;
  try {
    for (const scenario of [
      "normal",
      "empty",
      "focus-lost",
      "target-changed",
      "dispatch-error",
      "cleanup-error",
      "invalid",
    ]) {
      async function run(restored: boolean) {
        let time = 1000;
        Date.now = () => time;
        const calls: any[] = [];
        globalThis.setTimeout = ((callback: any, delay: number) => {
          calls.push(["delay", delay]);
          time += delay;
          callback();
          return 0;
        }) as any;
        keyboardDispatch.dispatchTextCharacter = (async (
          _cdp: any,
          target: any,
          text: any,
          options: any,
        ) => {
          calls.push(["character", target, text, options]);
          if (scenario === "dispatch-error") throw Error("input failed");
        }) as any;
        const context: any = {
          cdp: {},
          acquireAuthority() {
            calls.push("authority");
            return {
              actInFrame() {
                return {
                  async assert() {
                    calls.push("assert");
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
            async prepareSequentialInput(...args: any[]) {
              calls.push(["prepare", ...args]);
              return {
                target: { tabId: 1 },
                targetToken: "token",
                inputTargetToken: "input",
                blockClosedShadowInput: false,
              };
            },
            async evaluateOnPlaywrightSelectorWithTarget(
              tab: any,
              selector: any,
              callback: any,
              options: any,
            ) {
              calls.push(["validate", tab, selector, options]);
              const element: any = {
                matches() {
                  return scenario !== "focus-lost";
                },
                getRootNode() {
                  return {
                    activeElement: scenario === "focus-lost" ? null : element,
                  };
                },
              };
              Object.defineProperty(
                element,
                "__codexPressSequentiallyTargetToken",
                { value: "token" },
              );
              return {
                result: callback(element, {}, options.arg, { frameChain: [] }),
                target: { tabId: scenario === "target-changed" ? 2 : 1 },
              };
            },
            async evaluateOnPlaywrightSelector(
              tab: any,
              selector: any,
              callback: any,
              options: any,
            ) {
              calls.push(["cleanup", tab, selector, options]);
              if (scenario === "cleanup-error") throw Error("cleanup failed");
              const element: any = {};
              Object.defineProperty(
                element,
                "__codexPressSequentiallyTargetToken",
                { value: "token", configurable: true },
              );
              callback(element, {}, options.arg);
              calls.push([
                "tokenRemoved",
                !Object.hasOwn(element, "__codexPressSequentiallyTargetToken"),
              ]);
            },
          },
        };
        const result = await outcome(() =>
          (restored ? PlaywrightLocatorPressSequentiallyCommand : original.g2)(
            {
              tab_id: 1,
              selector: "input",
              value:
                scenario === "invalid"
                  ? 7
                  : scenario === "empty"
                    ? ""
                    : "a中🙂",
            },
            context,
          ),
        );
        return { result, calls };
      }
      assert.deepEqual(await run(true), await run(false), scenario);
    }
  } finally {
    keyboardDispatch.dispatchTextCharacter = dispatch;
    Date.now = now;
    globalThis.setTimeout = timer;
  }
});
test("assembled locator actions change selection, checkbox and Unicode text in Chromium", async () => {
  const browser = await chromium.launch({ headless: true }),
    source = new Function(`return (${serviceExpression("hF")})`)();
  try {
    async function run(restored: boolean) {
      const page = await browser.newPage();
      try {
        await page.setContent(
          "<select><option value=a>A</option><option value=b>B</option></select><input type=checkbox id=check><input id=plain>",
        );
        const session = await page.context().newCDPSession(page),
          cdp: any = {
            platform: "linux",
            addListener() {},
            async call(_tab: any, method: string, params: any) {
              return session.send(method as any, params);
            },
            async callTarget(_target: any, method: string, params: any) {
              return session.send(method as any, params);
            },
          };
        const service = new PlaywrightService(
          cdp,
          source,
          {
            startLocatorRetry() {
              return { finish() {}, attemptFailed() {} };
            },
          },
          { currentPlaywrightOperation: () => "input" },
          {
            async clickPoint() {
              throw Error("not used");
            },
          },
          false,
          { documentOnly: true, clickDispatch: "synthetic" },
        );
        const context: any = {
          cdp,
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
        await (restored ? PlaywrightLocatorSelectOptionCommand : original.b2)(
          { tab_id: 1, selector: "select", selections: [{ value: "b" }] },
          context,
        );
        await (restored ? PlaywrightLocatorSetCheckedCommand : original.y2)(
          { tab_id: 1, selector: "#check", checked: true },
          context,
        );
        await (
          restored ? PlaywrightLocatorPressSequentiallyCommand : original.g2
        )({ tab_id: 1, selector: "#plain", value: "a中🙂" }, context);
        return await page.evaluate(() => ({
          selected: document.querySelector("select")!.value,
          checked: (document.querySelector("#check") as HTMLInputElement)
            .checked,
          text: (document.querySelector("#plain") as HTMLInputElement).value,
          token: Object.hasOwn(
            document.querySelector("#plain")!,
            "__codexPressSequentiallyTargetToken",
          ),
        }));
      } finally {
        await page.close();
      }
    }
    const actual = await run(true);
    assert.deepEqual(actual, await run(false));
    assert.deepEqual(actual, {
      selected: "b",
      checked: true,
      text: "a中🙂",
      token: false,
    });
  } finally {
    await browser.close();
  }
});

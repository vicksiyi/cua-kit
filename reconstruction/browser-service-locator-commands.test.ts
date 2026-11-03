import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { originalServiceBindings, serviceExpression } from "./service-source";
import * as commands from "../packages/browser/src/service/commands/locator";
import { PlaywrightService } from "../packages/browser/src/service/playwright/service";
const original = originalServiceBindings([
  "F",
  "s2",
  "u2",
  "a2",
  "c2",
  "d2",
  "p2",
  "m2",
  "f2",
  "w2",
  "_2",
  "v2",
]);
const pairs = [
  ["PlaywrightLocatorClickCommand", "s2"],
  ["PlaywrightLocatorDblclickCommand", "u2"],
  ["PlaywrightLocatorCountCommand", "a2"],
  ["PlaywrightLocatorGetAttributeCommand", "c2"],
  ["PlaywrightLocatorInnerTextCommand", "d2"],
  ["PlaywrightLocatorIsEnabledCommand", "p2"],
  ["PlaywrightLocatorIsVisibleCommand", "m2"],
  ["PlaywrightLocatorAllTextContentsCommand", "f2"],
  ["PlaywrightLocatorTextContentCommand", "w2"],
  ["PlaywrightLocatorReadAllCommand", "_2"],
  ["PlaywrightLocatorWaitForCommand", "v2"],
] as const;
async function outcome(run: () => Promise<any>) {
  try {
    return { value: await run() };
  } catch (e) {
    return { error: (e as Error).message.split("\n")[0] };
  }
}
test("eleven locator commands preserve original authority, follow-tab and callback ordering", async () => {
  for (const [name, symbol] of pairs)
    for (const scenario of [
      "normal",
      "denied",
      "invalid-name",
      "protected",
      "missing",
      "relative",
      "hidden",
      "invalid-state",
    ]) {
      async function run(restored: boolean) {
        const calls: any[] = [],
          element: any = {
            textContent: "Text",
            innerText: 42,
            attributes: [
              { name: "id", value: "item" },
              { name: "value", value: "secret" },
            ],
            getAttribute(name: string) {
              calls.push(["attribute", name]);
              return name === "value" ? "secret" : "item";
            },
          },
          elements = scenario === "missing" ? [] : [element];
        const helper = {
          isProtectedCredentialField() {
            return scenario === "protected";
          },
          parseSelector(selector: string) {
            calls.push(["parse", selector]);
            return selector;
          },
          querySelectorAll(selector: any, node: any) {
            calls.push(["relative", selector, node === element]);
            return [];
          },
          elementState(_element: any, state: string) {
            calls.push(["state", state]);
            return { matches: state !== "hidden" };
          },
        };
        const context: any = {
          acquireAuthority() {
            calls.push("authority");
            return Object.fromEntries(
              ["actInFrame", "observeContent"].map((mode) => [
                mode,
                (url: any) => {
                  calls.push([mode, url]);
                  return {
                    async assert() {
                      calls.push("assert");
                      if (scenario === "denied") throw Error("denied");
                    },
                  };
                },
              ]),
            );
          },
          security: {
            async currentTabUrl(tab: any) {
              calls.push(["url", tab]);
              return "https://example.test";
            },
          },
          async followSessionTab(tab: any) {
            calls.push(["follow", tab]);
          },
          playwright: {
            async clickLocator(...args: any[]) {
              calls.push(["click", ...args]);
            },
            async countLocator(payload: any) {
              calls.push(["count", payload]);
              return 2;
            },
            async readElementState(...args: any[]) {
              calls.push(["readState", ...args]);
              return true;
            },
            async evaluateOnPlaywrightSelector(
              tab: any,
              selector: any,
              callback: any,
              options: any,
            ) {
              calls.push(["single", tab, selector, options]);
              return callback(element, helper, options.arg);
            },
            async evaluateOnPlaywrightSelectorAll(
              tab: any,
              selector: any,
              callback: any,
              options: any,
            ) {
              calls.push(["all", tab, selector, options]);
              return callback(elements, helper, options.arg);
            },
          },
        };
        const payload: any = {
          tab_id: "1",
          selector: "input",
          timeout_ms: 0,
          name:
            scenario === "invalid-name"
              ? ""
              : scenario === "protected"
                ? "VALUE"
                : "id",
          relative_selector: scenario === "relative" ? "span" : undefined,
          state:
            scenario === "invalid-state"
              ? "other"
              : scenario === "hidden"
                ? "hidden"
                : "visible",
        };
        const command = restored ? commands[name] : original[symbol];
        return {
          type: command.type,
          result: await outcome(() => command(payload, context)),
          calls,
        };
      }
      assert.deepEqual(
        await run(true),
        await run(false),
        `${name}:${scenario}`,
      );
    }
});
test("assembled locator observation commands preserve real DOM results and credential redaction", async () => {
  const browser = await chromium.launch({ headless: true }),
    source = new Function(`return (${serviceExpression("hF")})`)();
  try {
    const page = await browser.newPage();
    await page.setContent(
      "<div class=row><span>Child</span></div><div class=row></div><input id=password type=password value=secret><button>Button</button>",
    );
    const session = await page.context().newCDPSession(page),
      cdp: any = {
        platform: "darwin",
        addListener() {},
        async callTarget(_target: any, method: string, params: any) {
          return session.send(method as any, params);
        },
      },
      playwright = new PlaywrightService(
        cdp,
        source,
        {
          startLocatorRetry() {
            return { finish() {}, attemptFailed() {} };
          },
        },
        { currentPlaywrightOperation: () => "locator" },
        {
          async clickPoint() {
            throw Error("not requested");
          },
        },
      );
    const context: any = {
      playwright,
      acquireAuthority() {
        return {
          observeContent() {
            return { async assert() {} };
          },
        };
      },
      security: {
        async currentTabUrl() {
          return "about:blank";
        },
      },
    };
    for (const [name, symbol] of pairs.filter(
      ([name]) => !name.includes("Click") && !name.includes("Dblclick"),
    )) {
      const payload: any = {
        tab_id: 1,
        selector: name.includes("Attribute")
          ? "#password"
          : name.includes("ReadAll")
            ? ".row"
            : "button",
        name: "value",
        relative_selector: name.includes("ReadAll") ? "span" : undefined,
        timeout_ms: 0,
      };
      const actual = await outcome(() => commands[name](payload, context));
      assert.deepEqual(
        actual,
        await outcome(() => original[symbol](payload, context)),
        name,
      );
      if (name.includes("Attribute"))
        assert.deepEqual(actual, { value: { value: null } });
      if (name.includes("ReadAll"))
        assert.equal((actual as any).value.values[1], null);
    }
  } finally {
    await browser.close();
  }
});

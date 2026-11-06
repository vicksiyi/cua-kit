import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { PlaywrightLocatorReadAllCommand } from "../packages/browser/src/service/commands/locator";
import { defineCommand } from "../packages/browser/src/service/commands/define_command";
import { playwrightInstallation } from "../packages/browser/src/service/playwright/injection";
import { upstreamPlaywrightSource } from "../packages/browser/src/service/playwright/upstream_source";
import { originalServiceBindings, serviceSourceSha256 } from "./service-source";
assert.equal(
  serviceSourceSha256,
  "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021",
);
const original = originalServiceBindings(["R2"], { O: defineCommand }).R2;
test("collection read-all matches source on real DOM, relative selectors and protected values", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(
    '<section><span title="first">Alpha</span><input type="password" value="synthetic-password"></section><section><span title="second">Beta</span><input type="text" value="ordinary-value"></section><section><b>Other</b></section>',
  );
  await page.evaluate(
    playwrightInstallation(upstreamPlaywrightSource()).expression,
  );
  async function read(command: any, relativeSelector?: string, denied = false) {
    let evaluations = 0;
    const context: any = {
      security: { currentTabUrl: async () => page.url() },
      acquireAuthority: () => ({
        observeContent: () => ({
          assert: async () => {
            if (denied) throw Error("denied");
          },
        }),
      }),
      playwright: {
        evaluateOnPlaywrightSelectorAll: async (
          _id: any,
          selector: string,
          fn: any,
          options: any,
        ) => {
          evaluations++;
          return page.evaluate(
            ({ selector, body, arg }) => {
              const injected = (window as any).__codexPlaywrightInjected;
              const nodes = injected.querySelectorAll(
                injected.parseSelector(selector),
                document,
              );
              const callback = eval(`((__name) => (${body}))((fn) => fn)`);
              return callback(nodes, injected, arg);
            },
            { selector, body: fn.toString(), arg: options.arg },
          );
        },
      },
    };
    try {
      return {
        result: await command(
          {
            tab_id: "7",
            selector: "section",
            relative_selector: relativeSelector,
          },
          context,
        ),
        evaluations,
      };
    } catch (e: any) {
      return { error: e.message, evaluations };
    }
  }
  for (const relative of [undefined, "", "span", "input", "missing-element"])
    for (const denied of [false, true])
      assert.deepEqual(
        await read(PlaywrightLocatorReadAllCommand, relative, denied),
        await read(original, relative, denied),
      );
  const inputs = (await read(PlaywrightLocatorReadAllCommand, "input")).result
    .values;
  assert.equal(inputs[0].attributes.value, undefined);
  assert.equal(inputs[1].attributes.value, "ordinary-value");
  assert.equal(inputs[2], null);
  assert.deepEqual(await read(PlaywrightLocatorReadAllCommand, "span", true), {
    error: "denied",
    evaluations: 0,
  });
});

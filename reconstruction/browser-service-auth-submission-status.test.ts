import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import { readAuthPageBinding } from "../packages/browser/src/service/browser_auth/bindings";
import {
  authSubmissionControlChanged,
  waitForAuthSubmission,
} from "../packages/browser/src/service/browser_auth/submission_status";
const original = originalServiceBindings(["cte", "lte"], {
  Ka: readAuthPageBinding,
  zee: 1000,
  Kee: 50,
});
test("submission control probes match original truthiness, count and error boundaries", async () => {
  for (const count of [0, 1, 2])
    for (const visible of [false, true, undefined, "yes"])
      for (const enabled of [false, true])
        for (const check of [false, true]) {
          const trace: any[] = [];
          const context: any = {
            playwright: {
              async countLocator() {
                trace.push("count");
                return count;
              },
              async readElementState(_locator: any, state: string) {
                trace.push(state);
                return state === "visible" ? visible : enabled;
              },
            },
          };
          const actual = await authSubmissionControlChanged(
              { tab_id: "7", selector: "#submit" },
              context,
              check,
            ),
            first = [...trace];
          trace.length = 0;
          assert.equal(actual, await original.cte({}, context, check));
          assert.deepEqual(trace, first);
        }
});
test("submission polling preserves exact deadline, retry interval and second origin check", async (t) => {
  let now = 0;
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "setTimeout", ((
    callback: Function,
    delay: number,
  ) => {
    now += delay;
    callback();
    return 1;
  }) as any);
  async function run(source: boolean, mode: string) {
    now = 0;
    let reads = 0,
      counts = 0;
    const trace: any[] = [];
    const context: any = {
      cdp: {
        async call() {
          trace.push(["page", now]);
          reads++;
          if (mode === "cdp-error") throw new Error("page error");
          return {
            frameTree: {
              frame: {
                id: "root",
                loaderId: mode === "missing-loader" ? "" : "l",
                securityOrigin:
                  mode === "origin-before" ||
                  (mode === "origin-after" && reads === 2)
                    ? "https://other.test"
                    : "https://fixture.test",
                url: "https://fixture.test/",
              },
            },
          };
        },
      },
      playwright: {
        async countLocator() {
          trace.push(["count", now]);
          counts++;
          if (mode === "probe-error") throw new Error("probe");
          return mode === "gone" ||
            mode === "origin-after" ||
            (mode === "later" && counts === 3)
            ? 0
            : 1;
        },
        async readElementState(_locator: any, state: string) {
          trace.push([state, now]);
          return mode !== "disabled" || state !== "enabled";
        },
      },
    };
    let result;
    try {
      result = await (source ? original.lte : waitForAuthSubmission)(
        { tab_id: "7", selector: "#submit" },
        "https://fixture.test",
        context,
        mode !== "no-state",
      );
    } catch (error) {
      result = (error as Error).message;
    }
    return { result, trace };
  }
  for (const mode of [
    "gone",
    "later",
    "disabled",
    "no-state",
    "timeout",
    "probe-error",
    "origin-before",
    "origin-after",
    "missing-loader",
    "cdp-error",
  ])
    assert.deepEqual(await run(false, mode), await run(true, mode), mode);
});

test("default OTP field delivery uses actual restored key dispatch and observes Chromium control removal", async () => {
  const { chromium } = await import("playwright");
  const { authFieldDelivery } =
    await import("../packages/browser/src/service/browser_auth/field_delivery");
  const { createAuthFieldPlan } =
    await import("../packages/browser/src/service/browser_auth/field_plan");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://otp.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<form><input id="a" maxlength="1"><input id="b" maxlength="1"><input id="c" maxlength="1"><input id="d" maxlength="1"><button id="submit" type="button">Done</button></form>',
      }),
    );
    await page.goto("https://otp.test/");
    const session = await page.context().newCDPSession(page),
      keys: any[] = [];
    const cdp: any = {
      platform: "darwin",
      async call(_tab: number, method: string, params: any) {
        if (method === "Input.dispatchKeyEvent")
          keys.push([params.type, params.key]);
        return session.send(method as any, params);
      },
      async callTarget(_target: any, method: string, params: any) {
        if (method === "Input.dispatchKeyEvent")
          keys.push([params.type, params.key]);
        return session.send(method as any, params);
      },
    };
    const bound: any = {
      async focusLocator(payload: any) {
        await page.locator(payload.selector).focus();
        return { target: { tabId: 7 } };
      },
    };
    const context: any = {
      cdp,
      playwright: {
        async withBoundPlaywrightSelector(
          _tab: string,
          _selector: string,
          before: Function,
          action: Function,
        ) {
          if (await before()) await action(bound);
        },
        async countLocator(payload: any) {
          return page.locator(payload.selector).count();
        },
        async readElementState(payload: any, state: string) {
          return state === "visible"
            ? page.locator(payload.selector).isVisible()
            : page.locator(payload.selector).isEnabled();
        },
      },
    };
    const completed: string[] = [];
    const checkpoint: any = {
      ctx: context,
      nativeDelivery: false,
      params: { tab_id: "7", timeout_ms: 2000 },
      credentialPlan: createAuthFieldPlan(
        ["a", "b", "c", "d"].map((id) => ({
          id,
          selector: "#" + id,
          label: id,
          type: "text",
          required: true,
          labelMetadata: { input_mode: "numeric" },
        })),
      ),
      async revalidateBeforeAction() {
        return null;
      },
      async reinspectOrdinary() {
        return false;
      },
      completeOrdinaryField(id: string) {
        completed.push(id);
      },
    };
    assert.equal(
      await authFieldDelivery.fillPlan({ otp: "1-2 3\n4" }, checkpoint),
      null,
    );
    assert.deepEqual(
      await page
        .locator("input")
        .evaluateAll((elements) =>
          elements.map((element) => (element as HTMLInputElement).value),
        ),
      ["1", "2", "3", "4"],
    );
    assert.deepEqual(completed, ["a", "b", "c", "d"]);
    assert.equal(keys.length, 8);
    await page.locator("#submit").evaluate((element) => element.remove());
    assert.equal(
      await waitForAuthSubmission(
        { tab_id: "7", selector: "#submit" },
        "https://otp.test",
        context,
        true,
      ),
      "submitted",
    );
  } finally {
    await browser.close();
  }
});

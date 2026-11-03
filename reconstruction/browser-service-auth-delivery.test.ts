import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  createAuthFieldDelivery,
  authFieldDelivery,
} from "../packages/browser/src/service/browser_auth/field_delivery";
import { readAuthSubmissionOrigin } from "../packages/browser/src/service/browser_auth/submission_origin";
import { authFieldPage } from "../packages/browser/src/service/browser_auth/field_page";
import { createAuthFieldPlan } from "../packages/browser/src/service/browser_auth/field_plan";
async function run(source: boolean, mode: string) {
  const trace: any[] = [];
  let checks = 0,
    retried = false;
  const bound = {
    async evaluateOnPlaywrightSelectorWithTarget(
      tab: string,
      selector: string,
      callback: unknown,
      options: any,
    ) {
      trace.push(["fill", tab, selector, callback === authFieldPage, options]);
      if (mode === "fill-error" || mode === "verified")
        throw new Error("fixture");
    },
  };
  const ctx: any = {
    marker: "parent",
    playwright: {
      async withBoundPlaywrightSelector(
        tab: string,
        selector: string,
        before: Function,
        action: Function,
        options: any,
      ) {
        trace.push(["bind", tab, selector, options]);
        if (mode === "bind-error") throw new Error("bind");
        if (await before()) await action(bound);
      },
    },
  };
  const dependencies: any = {
    async press(payload: any, scoped: any) {
      trace.push([
        "press",
        payload,
        Object.getPrototypeOf(scoped) === ctx,
        scoped.playwright === bound,
        Object.getOwnPropertyDescriptor(scoped, "playwright")?.enumerable,
      ]);
    },
    async submissionOrigin(...args: any[]) {
      trace.push(["origin", args[2]]);
      return { url: "https://fixture.test/submit" };
    },
  };
  const old = originalServiceBindings(["pte", "mte"], {
    Ga: "otp",
    Af: dependencies.press,
    vf: dependencies.submissionOrigin,
    Y_: authFieldPage,
  });
  const api = source ? old.pte : createAuthFieldDelivery(dependencies).fillPlan;
  const otp = mode.startsWith("otp");
  const fields = Array.from({ length: otp ? 4 : 2 }, (_, i) => ({
    id: "f" + i,
    selector: "#f" + i,
    label: "field",
    type: "text",
    required: true,
    labelMetadata: otp ? { input_mode: "numeric" } : {},
  }));
  const checkpoint: any = {
    credentialPlan: createAuthFieldPlan(fields),
    params: {
      tab_id: "7",
      timeout_ms: 100,
      submit:
        mode === "missing-submit"
          ? undefined
          : { selector: "iframe >> internal:control=enter-frame >> #submit" },
    },
    ctx,
    nativeDelivery: mode === "native" || mode === "missing-submit",
    async revalidateBeforeAction(option: unknown, field: any) {
      trace.push(["validate", option, field.id]);
      checks++;
      return mode === "reject" || (mode === "retry" && checks === 1)
        ? "page_changed"
        : null;
    },
    completeOrdinaryField(id: string) {
      trace.push(["complete", id]);
    },
    async reinspectOrdinary(status: string) {
      trace.push(["reinspect", status]);
      if (mode === "retry" && !retried) {
        retried = true;
        return true;
      }
      return false;
    },
    ordinaryAttempt:
      mode === "no-attempt"
        ? undefined
        : {
            beginOrdinaryFill(...args: any[]) {
              trace.push(["begin", ...args]);
            },
            completeOrdinaryFill(index: number) {
              trace.push(["complete-fill", index]);
            },
            recordAttempt(event: any) {
              trace.push(["uncertain", event]);
            },
            async verifiedOrdinarySiteSubmission(timeout: number) {
              trace.push(["verified", timeout]);
              return mode === "verified";
            },
          },
  };
  const values = otp
    ? {
        otp:
          mode === "otp-short"
            ? "12"
            : mode === "otp-unicode"
              ? "😀-b c-d"
              : "1-2 3\n4",
      }
    : mode === "skip"
      ? { f1: "second" }
      : { f0: "first", f1: "second" };
  const result = await api(values, checkpoint, "option");
  return JSON.parse(JSON.stringify({ result, trace }));
}
test("auth field delivery matches original OTP expansion, bound context, retry and uncertain submission ordering", async () => {
  for (const mode of [
    "normal",
    "native",
    "missing-submit",
    "otp",
    "otp-short",
    "otp-unicode",
    "skip",
    "no-attempt",
    "reject",
    "retry",
    "bind-error",
    "fill-error",
    "verified",
  ])
    assert.deepEqual(await run(false, mode), await run(true, mode), mode);
});
test("submission origin callback matches original Chromium form and submitter semantics", async () => {
  const original = originalServiceBindings(["vf"]).vf;
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://form.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<form method="post" action="/submit#fragment"><input name="action"><button id="submit">Submit</button><input id="other"></form><button id="outside">Outside</button>',
      }),
    );
    async function execute(
      source: boolean,
      mode: string,
      requirePost: boolean,
    ) {
      await page.goto("https://form.test/");
      await page.evaluate((mode) => {
        const form = document.querySelector("form")!,
          submit = document.querySelector("button")!;
        if (mode === "get") form.method = "get";
        if (mode === "http") form.action = "http://form.test/submit";
        if (mode === "javascript") form.action = "javascript:void(0)";
        if (mode === "override") {
          submit.formAction = "https://other.test/submit#x";
          submit.formMethod = "post";
        }
        if (mode === "disabled") {
          submit.disabled = true;
          submit.formAction = "https://other.test/submit";
        }
      }, mode);
      const trace: any[] = [];
      const context: any = {
        playwright: {
          async evaluateOnPlaywrightSelector(
            tab: string,
            selector: string,
            callback: Function,
            options: any,
          ) {
            trace.push([tab, selector, options]);
            if (mode === "error") throw new Error("fixture");
            return page
              .locator(selector)
              .evaluate(
                new Function(
                  "element",
                  "arg",
                  `return (${callback.toString()})(element, {}, arg)`,
                ) as any,
                options.arg,
              );
          },
        },
      };
      const result = await (source ? original : readAuthSubmissionOrigin)(
        {
          tab_id: "7",
          submit:
            mode === "no-submit"
              ? undefined
              : {
                  selector:
                    mode === "outside"
                      ? "#outside"
                      : mode === "fallback" || mode === "disabled"
                        ? "#other"
                        : "#submit",
                },
          timeout_ms: 40,
        },
        context,
        requirePost,
      );
      return { result, trace };
    }
    for (const mode of [
      "normal",
      "get",
      "http",
      "javascript",
      "override",
      "disabled",
      "outside",
      "fallback",
      "no-submit",
      "error",
    ])
      for (const requirePost of [false, true])
        assert.deepEqual(
          await execute(false, mode, requirePost),
          await execute(true, mode, requirePost),
          `${mode}/${requirePost}`,
        );
    await page.goto("https://form.test/");
    const completed: string[] = [];
    const bound = {
      async evaluateOnPlaywrightSelectorWithTarget(
        _tab: string,
        selector: string,
        callback: Function,
        options: any,
      ) {
        return page
          .locator(selector)
          .evaluate(
            new Function(
              "element",
              "arg",
              `return (${callback.toString()})(element, {retarget(e){return e},elementState(){return {matches:true}},fill(){return 'needsinput'}}, arg)`,
            ) as any,
            options.arg,
          );
      },
    };
    const checkpoint: any = {
      params: { tab_id: "7" },
      nativeDelivery: false,
      ctx: {
        playwright: {
          async withBoundPlaywrightSelector(
            _tab: string,
            _selector: string,
            before: Function,
            action: Function,
          ) {
            if (await before()) await action(bound);
          },
        },
      },
      credentialPlan: createAuthFieldPlan([
        {
          id: "field",
          selector: "#other",
          label: "Fixture",
          type: "text",
          required: true,
          labelMetadata: {},
        },
      ]),
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
      await authFieldDelivery.fillPlan(
        { field: "synthetic-value" },
        checkpoint,
      ),
      null,
    );
    assert.equal(await page.locator("#other").inputValue(), "synthetic-value");
    assert.deepEqual(completed, ["field"]);
  } finally {
    await browser.close();
  }
});

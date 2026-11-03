import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import * as plan from "../packages/browser/src/service/browser_auth/field_plan";
import { createAuthSubmission } from "../packages/browser/src/service/browser_auth/submission";
async function scenario(source: boolean, mode: string) {
  const trace: any[] = [];
  let retried = false;
  const params: any = {
    browser_id: "fixture",
    tab_id: "7",
    origin: "https://fixture.test",
    fields: [
      { id: "u", selector: "#u", type: "text" },
      { id: "p", selector: "#p", type: "password" },
    ],
    submit: {
      selector: "#submit",
      action: mode === "enter" ? "press_enter" : "click",
    },
  };
  const fields: any[] = [
    { id: "u", required: true },
    { id: "p", required: true },
  ];
  let values: any = { u: "synthetic-user", p: "synthetic-password" };
  let promptOptions: any;
  if (mode === "bad-values") values = { u: 123 };
  if (mode === "missing-option") promptOptions = [];
  if (mode === "option" || mode === "option-reject") {
    params.options = [{ id: "choice", selector: "#choice", field_ids: [] }];
    promptOptions = params.options;
    fields.splice(0);
    values = {};
  }
  if (mode === "no-submit") delete params.submit;
  if (mode === "qr") {
    params.fields = [];
    params.qr_code = true;
    delete params.submit;
  }
  const bound: any = {
    async clickLocator(locator: any, count: number) {
      trace.push(["click", locator, count]);
      if (mode === "action-error") throw new Error("click");
    },
    async evaluateOnPlaywrightSelector(
      tab: string,
      selector: string,
      _callback: Function,
      options: any,
    ) {
      trace.push(["native", tab, selector, options]);
      return mode !== "native-false";
    },
  };
  const context: any = {
    playwright: {
      async evaluateOnPlaywrightSelector(
        tab: string,
        selector: string,
        callback: Function,
        options: any,
      ) {
        trace.push(["enabled", tab, selector, options]);
        return callback(
          {},
          {
            elementState() {
              return { matches: mode !== "disabled" };
            },
          },
        );
      },
      async withBoundPlaywrightSelector(
        tab: string,
        selector: string,
        guard: Function,
        action: Function,
        options: any,
      ) {
        trace.push(["bound", tab, selector, options]);
        if (mode === "bind-error") throw new Error("bind");
        if (await guard()) await action(bound);
      },
    },
  };
  const checkpoint: any = {
    params,
    ctx: context,
    credentialPlan: { promptFields: fields, fillFields: [] },
    nativeDelivery: mode === "native-delivery",
    manualCredentialSave: mode.startsWith("manual") || mode === "native-false",
    manualSubmission: {
      username: { selector: "#u" },
      password: { selector: "#p" },
    },
    async revalidateReviewedPresentation(...args: any[]) {
      trace.push(["review", ...args]);
      return mode === "review-reject"
        ? "prompt_changed"
        : mode === "review-retry" && !retried
          ? "page_changed"
          : null;
    },
    async reinspectOrdinary(status: string) {
      trace.push(["retry", status]);
      if ((mode === "review-retry" || mode === "submit-retry") && !retried) {
        retried = true;
        return true;
      }
      return false;
    },
    async revalidateBeforeAction(option: any) {
      trace.push(["action-check", option]);
      return mode === "option-reject" ? "page_changed" : null;
    },
    async revalidateBeforeSubmit(option: any) {
      trace.push(["submit-check", option]);
      return mode === "submit-reject" ||
        mode === "manual-reject" ||
        (mode === "submit-retry" && !retried)
        ? "origin_changed"
        : null;
    },
    async revalidateCredentialSubmission(scoped: any) {
      trace.push([
        "credential-check",
        scoped.playwright === bound,
        Object.getPrototypeOf(scoped) === context,
      ]);
      return mode === "credential-reject" ? "origin_changed" : null;
    },
  };
  if (mode === "manual-missing") delete checkpoint.manualSubmission;
  if (
    mode === "verified" ||
    mode === "submit-retry" ||
    mode === "action-error" ||
    mode === "bind-error"
  )
    checkpoint.ordinaryAttempt = {
      async verifiedOrdinarySiteSubmission(timeout: number) {
        trace.push(["verified", timeout]);
        return mode === "verified";
      },
      beginOrdinarySubmit() {
        trace.push(["begin"]);
      },
    };
  if (mode === "otp" || mode === "otp-wait") {
    checkpoint.credentialPlan.fillFields = [
      { promptId: "otp", fields: [{}, {}] },
    ];
    fields.splice(0, fields.length, { id: "otp", required: true });
    values = { otp: "1234" };
  }
  const deps: any = {
    nativeSubmit() {
      return true;
    },
    async deliverFields(input: any, _cp: any, option: any) {
      trace.push(["deliver", input, option]);
      return mode === "delivery-error" ? "locator_invalid" : null;
    },
    async waitForSubmission(...args: any[]) {
      trace.push(["wait", args[0], args[1], args[3]]);
      return mode === "otp" ? "submitted" : null;
    },
    async press(locator: any, scoped: any) {
      trace.push(["press", locator, scoped.playwright === bound]);
    },
  };
  const original = originalServiceBindings(["ute"], {
    fte: plan.validateAuthValues,
    tN: plan.findAuthOption,
    dte: plan.validAuthOptionValues,
    Sv: plan.isQrOnlyAuth,
    J_: deps.nativeSubmit,
    pte: deps.deliverFields,
    lte: deps.waitForSubmission,
    Af: deps.press,
    Ga: plan.otpPromptId,
  }).ute;
  const result = await (source ? original : createAuthSubmission(deps))(
    values,
    "choice",
    promptOptions,
    checkpoint,
    fields,
  );
  return JSON.parse(JSON.stringify({ result, trace }));
}
test("auth submission matches original branches, retries, bound actions and failure precedence", async () => {
  for (const mode of [
    "normal",
    "enter",
    "bad-values",
    "missing-option",
    "option",
    "option-reject",
    "no-submit",
    "qr",
    "manual",
    "manual-missing",
    "manual-reject",
    "native-false",
    "native-delivery",
    "review-reject",
    "review-retry",
    "submit-reject",
    "submit-retry",
    "credential-reject",
    "verified",
    "action-error",
    "bind-error",
    "disabled",
    "otp",
    "otp-wait",
    "delivery-error",
  ])
    assert.deepEqual(
      await scenario(false, mode),
      await scenario(true, mode),
      mode,
    );
  assert.equal((await scenario(false, "normal")).result, "submitted");
  assert.deepEqual((await scenario(false, "qr")).trace, []);
  assert.equal(
    (await scenario(false, "action-error")).result,
    "submission_failed",
  );
  assert.equal((await scenario(false, "submit-retry")).result, "submitted");
  assert.ok(
    (await scenario(false, "enter")).trace.some(
      (entry: any) => entry[0] === "press",
    ),
  );
  assert.equal(
    (await scenario(false, "action-error")).trace.filter(
      (entry: any) => entry[0] === "click",
    ).length,
    1,
  );
});

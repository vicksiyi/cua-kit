import { classifyAuthCredentialFields } from "../packages/browser/src/service/browser_auth/credential_fields";
import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import { createAuthCheckpointClass } from "../packages/browser/src/service/browser_auth/checkpoint";
import * as bindings from "../packages/browser/src/service/browser_auth/bindings";
import * as inspection from "../packages/browser/src/service/browser_auth/field_inspection";
import {
  createAuthFieldPlan,
  isQrOnlyAuth,
} from "../packages/browser/src/service/browser_auth/field_plan";
import { httpOrigin } from "../packages/browser/src/service/security/authority_builder";
async function outcome(run: () => any) {
  try {
    return await run();
  } catch (error) {
    return { error: (error as Error).message };
  }
}
async function scenario(source: boolean, mode: string) {
  const trace: any[] = [];
  let active = false;
  const frame: any = {
    domainAndRegistry: "fixture.test",
    frameId: "root",
    loaderId: "l",
    url: "https://fixture.test/",
    securityOrigin: "https://fixture.test",
  };
  const fields: any[] = [
    {
      id: "user",
      selector: "#user",
      type: "text",
      label: "User",
      required: true,
    },
    {
      id: "password",
      selector: "#password",
      type: "password",
      label: "Password",
      required: true,
    },
  ];
  const params: any = {
    tab_id: "7",
    browser_id: "fixture",
    origin: "https://fixture.test",
    fields,
    options: [
      { id: "choice", selector: "#choice", field_ids: ["user", "password"] },
    ],
    submit: { selector: "#submit", action: "click" },
  };
  const context: any = {
    cdp: {
      async call() {
        trace.push("page");
        return {
          frameTree: {
            frame: {
              ...frame,
              id: "root",
              ...(active && mode === "page-change" ? { loaderId: "new" } : {}),
              ...(active && mode === "origin-change"
                ? { securityOrigin: "https://other.test" }
                : {}),
            },
          },
        };
      },
    },
    playwright: {
      async evaluateOnPlaywrightSelector(
        _tab: string,
        selector: string,
        _callback: Function,
        options: any,
      ) {
        trace.push(["evaluate", selector, options]);
        if (active && mode === "inspection-error") throw new Error("inspect");
        if (options.arg.operation === "browser-auth-user-visibility")
          return !(active && mode === "invisible");
        return {
          accessible_name:
            active && mode === "metadata-change" ? "changed" : selector,
          autocomplete: null,
          input_type: options.arg.expectedType,
          input_mode: null,
          input_name: selector,
          required: true,
        };
      },
      async evaluateOnPlaywrightSelectorWithTarget(
        _tab: string,
        selector: string,
        _callback: Function,
        options: any,
      ) {
        trace.push(["binding", selector, options]);
        if (active && mode === "binding-error") throw new Error("binding");
        return {
          frameIdentity: frame,
          result: frame.url,
          target: {
            tabId: 7,
            ...(active && mode === "target-change" ? { sessionId: "new" } : {}),
          },
        };
      },
      async countLocator(payload: any) {
        trace.push(["count", payload.selector]);
        return 1;
      },
      async readElementState(payload: any, state: string) {
        trace.push(["state", payload.selector, state]);
        return true;
      },
      async selectorsResolveToDistinctElements(
        _tab: string,
        selectors: string[],
      ) {
        trace.push(["distinct", selectors]);
        return true;
      },
    },
  };
  const targets = {
    options: [{ id: "choice", origin: "https://fixture.test" }],
    submissionOrigin: "https://fixture.test",
  };
  const deps: any = {
    async actionTargets(request: any) {
      trace.push(["targets", request.fields.map((f: any) => f.id)]);
      return mode === "targets-missing"
        ? null
        : mode === "targets-change"
          ? { ...targets, submissionOrigin: "https://other.test" }
          : targets;
    },
    classifyCredentialFields(
      input: any[],
      passwordOnly: boolean,
      options: any,
    ) {
      trace.push(["classify", input.map((f) => f.id), passwordOnly, options]);
      return mode === "classify-change"
        ? null
        : { username: { id: "user" }, password: { id: "password" } };
    },
    async submissionOrigin(_request: any, _context: any, requirePost: boolean) {
      trace.push(["origin", requirePost]);
      return mode === "submission-change"
        ? "https://other.test"
        : "https://fixture.test";
    },
  };
  if (mode === "ordinary-default-classifier")
    deps.classifyCredentialFields = classifyAuthCredentialFields;
  const Original = originalServiceBindings(["yv"], {
    Sv: isQrOnlyAuth,
    Ka: bindings.readAuthPageBinding,
    ze: httpOrigin,
    za: inspection.inspectAuthFields,
    Rh: bindings.readAuthFormBinding,
    iN: bindings.readAuthOptionBindings,
    dc: deps.actionTargets,
    Rc: deps.classifyCredentialFields,
    Ph: inspection.validAuthOptions,
    Va: bindings.sameAuthDocument,
    Ch: bindings.revalidateAuthPage,
    Ah: inspection.validAuthFields,
    vv: inspection.validAuthControl,
    eN: bindings.revalidateAuthForm,
    pc: deps.submissionOrigin,
    aN: createAuthFieldPlan,
    Ih: bindings.readAuthFrameBinding,
  }).yv;
  const { classifyCredentialFields: _classifier, ...otherDeps } = deps;
  const Class = source
    ? Original
    : createAuthCheckpointClass(
        mode === "ordinary-default-classifier" ? otherDeps : deps,
      );
  const validated = await inspection.inspectAuthFields(params, context);
  const form = await bindings.readAuthFormBinding(params, context),
    options = await bindings.readAuthOptionBindings(params, context);
  trace.length = 0;
  active = true;
  const checkpoint = new Class(
    params,
    context,
    frame,
    mode === "missing-form" ? null : form,
    options,
    createAuthFieldPlan(validated!),
    mode === "unreviewed" ? undefined : targets,
  );
  if (mode === "manual-reject")
    checkpoint.manualSavingRejection = () => "rejected";
  if (mode === "native" || mode === "submission-change")
    checkpoint.nativeDelivery = true;
  if (mode === "manual-save") checkpoint.manualCredentialSave = true;
  if (mode === "missing-option") checkpoint.optionBindings.clear();
  if (mode.startsWith("ordinary") || mode === "classify-change") {
    checkpoint.credentialSubmissionFields = validated;
    checkpoint.ordinaryCredentialFields = {
      username: "user",
      password: "password",
    };
    checkpoint.ordinaryAttempt = {
      recordAttempt(event: any) {
        trace.push(["attempt", event]);
      },
      refreshOrdinaryDocument(...args: any[]) {
        trace.push(["refresh", ...args]);
      },
    };
  }
  const results: any[] = [];
  results.push(checkpoint.paramsForSelectedOption(params.options[0]));
  results.push(
    await checkpoint.revalidateBeforeAction(params.options[0], fields[0]),
  );
  results.push(
    await checkpoint.revalidateReviewedPresentation(params.options[0]),
  );
  results.push(await checkpoint.revalidateBeforeSubmit());
  results.push(await checkpoint.revalidateForReview());
  results.push(await checkpoint.revalidateCredentialSubmission());
  checkpoint.completeOrdinaryField("user");
  results.push(checkpoint.paramsForSelectedOption(params.options[0]));
  results.push(
    await checkpoint.reinspectOrdinary(
      mode === "ordinary-no-retry" ? "submission_failed" : "page_changed",
    ),
  );
  results.push(await checkpoint.reinspectOrdinary("locator_invalid"));
  return JSON.parse(
    JSON.stringify({
      results,
      trace,
      reinspections: checkpoint.ordinaryReinspections,
      completed: [...checkpoint.completedOrdinaryFields],
      origin: checkpoint.currentOrigin,
    }),
  );
}
test("full auth checkpoint matches original validation, selection and ordinary reinspection traces", async () => {
  for (const mode of [
    "normal",
    "unreviewed",
    "page-change",
    "origin-change",
    "inspection-error",
    "invisible",
    "metadata-change",
    "binding-error",
    "target-change",
    "targets-missing",
    "targets-change",
    "classify-change",
    "manual-reject",
    "native",
    "manual-save",
    "submission-change",
    "missing-option",
    "ordinary",
    "ordinary-no-retry",
  ]) {
    const actual = await outcome(() => scenario(false, mode));
    assert.equal("error" in actual, false, mode);
    assert.deepEqual(actual, await outcome(() => scenario(true, mode)), mode);
    if (mode === "normal") assert.equal(actual.results[1], null);
    if (mode === "classify-change") assert.equal(actual.reinspections, 3);
    if (mode === "ordinary")
      assert.ok(
        actual.trace.some(
          (entry: any) =>
            entry[0] === "attempt" &&
            entry[1].kind === "reinspection_succeeded",
        ),
      );
  }
});
test("auth checkpoint requires a form binding except for exact QR-only requests", () => {
  const deps: any = {};
  const Class = createAuthCheckpointClass(deps);
  for (const qr of [false, true]) {
    const params = { origin: "https://fixture.test", fields: [], qr_code: qr };
    if (qr)
      assert.doesNotThrow(
        () =>
          new Class(
            params,
            {},
            {},
            undefined,
            new Map(),
            createAuthFieldPlan([]),
          ),
      );
    else
      assert.throws(
        () =>
          new Class(
            params,
            {},
            {},
            undefined,
            new Map(),
            createAuthFieldPlan([]),
          ),
        /form binding is required/,
      );
  }
});

test("checkpoint uses its restored default classifier for ordinary reinspection", async () => {
  const actual = await scenario(false, "ordinary-default-classifier");
  assert.deepEqual(actual, await scenario(true, "ordinary-default-classifier"));
  assert.ok(
    actual.trace.some(
      (entry: any) =>
        entry[0] === "attempt" && entry[1].kind === "reinspection_succeeded",
    ),
  );
});

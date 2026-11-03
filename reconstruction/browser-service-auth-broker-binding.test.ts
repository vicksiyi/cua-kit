import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  createAuthCredentialBinding,
  createManualSavePreflight,
} from "../packages/browser/src/service/browser_auth/broker_binding";
import {
  codexTurnMetadata,
  metadataSession,
} from "../packages/browser/src/service/preferences/request_context";
import { classifyAuthCredentialFields } from "../packages/browser/src/service/browser_auth/credential_fields";
import { allowsOrdinaryCredentialOption } from "../packages/browser/src/service/browser_auth/field_plan";
import { authSubmissionOrigin } from "../packages/browser/src/service/browser_auth/action_review";
import { readAuthSubmissionOrigin } from "../packages/browser/src/service/browser_auth/submission_origin";
import { inspectAuthFields } from "../packages/browser/src/service/browser_auth/field_inspection";
import { isCredentialDocumentContained } from "../packages/browser/src/service/credentials/containment";
import { nativeAuthSubmit } from "../packages/browser/src/service/browser_auth/native_submit";
async function run(
  source: boolean,
  mode: string,
  ordinary: boolean,
  binding = false,
) {
  const trace: any[] = [];
  const fields: any[] = [
    {
      id: "u",
      selector: "#u",
      type: "text",
      required: true,
      labelMetadata: {
        input_type: "text",
        input_name: "username",
        accessible_name: "Username",
        autocomplete: "username",
      },
    },
    {
      id: "p",
      selector: "#p",
      type: "password",
      required: true,
      labelMetadata: {
        input_type: "password",
        input_name: "password",
        accessible_name: "Password",
        autocomplete: null,
      },
    },
  ];
  const request: any = {
    tab_id: "7",
    browser_id: "fixture",
    origin: "https://fixture.test",
    fields,
    submit: { selector: "#submit", action: "click" },
  };
  let challenge: any[] = fields.map(({ id, required }) => ({ id, required }));
  let origin = "https://fixture.test",
    frameOrigin: any = origin;
  const env: any = {
    BROWSER_AUTH_BROKER_MANUAL_SAVE_BINDING_VERSION: ordinary ? "10" : "8",
    BROWSER_AUTH_BROKER_CREDENTIAL_OPTIONS_VERSION: "1",
  };
  const metadata: any = {
    session_id:
      mode === "session"
        ? ""
        : mode === "long-session"
          ? "x".repeat(257)
          : "session",
  };
  if (mode === "subagent")
    Object.assign(metadata, { thread_source: "subagent", thread_id: "child" });
  if (mode === "field-count") fields.push({ ...fields[0], id: "extra" });
  if (mode === "optional") fields[0].required = false;
  if (mode === "challenge-count") challenge = [];
  if (mode === "challenge-optional") challenge[0].required = false;
  if (mode === "missing-submit") delete request.submit;
  if (mode === "qr") request.qr_code = true;
  if (mode === "origin") frameOrigin = "https://other.test";
  if (mode === "http") {
    origin = "http://fixture.test";
    frameOrigin = origin;
  }
  if (mode === "username")
    fields[0].labelMetadata.autocomplete = "one-time-code";
  if (mode === "password")
    fields[1].labelMetadata.autocomplete = "new-password";
  if (mode === "mapping") challenge[0].id = "wrong";
  if (mode === "names") fields[0].labelMetadata.input_name = "password";
  if (mode === "options")
    request.options = [{ id: "choice", field_ids: ["u", "p"] }];
  if (mode === "password-only") {
    fields.shift();
    challenge.shift();
    env.BROWSER_AUTH_BROKER_PASSWORD_ONLY_VERSION = "1";
  }
  const context: any = {
    runtime: { env, requestMeta: { "x-codex-turn-metadata": metadata } },
    clientInfo: { type: "fixture" },
    cdp: {
      async call(_tab: number, method: string, args: any) {
        trace.push(["cdp", method, args]);
        if (method === "Page.getFrameTree")
          return {
            frameTree: {
              frame: { id: "root", securityOrigin: origin },
              ...(mode === "child-frame" ? { childFrames: [{}] } : {}),
            },
          };
        if (method === "DOM.getDocument")
          return { root: { localName: "html" } };
        if (method === "Page.createIsolatedWorld")
          return { executionContextId: 1 };
        return { result: { value: mode !== "service-worker" } };
      },
      async browserAuthNewTargetCheck() {
        trace.push(["targets"]);
        return "contained";
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
        const op = options.arg.operation;
        if (op === "browser-auth-submission-origin")
          return mode === "target"
            ? undefined
            : { origin, url: origin + "/post" };
        if (op === "browser-auth-user-visibility") return mode !== "reinspect";
        if (op === "browser-auth-field-label-metadata") {
          const metadata = {
            ...fields.find((f) => f.selector === selector).labelMetadata,
          };
          if (mode === "metadata") metadata.autocomplete = "one-time-code";
          return metadata;
        }
        if (mode === "native-error") throw new Error("native");
        return mode !== "native-false";
      },
      async selectorsResolveToDistinctElements() {
        return true;
      },
      async countLocator() {
        return 1;
      },
      async readElementState() {
        return true;
      },
    },
  };
  const telemetry = {
    logStatsigEvent(
      _runtime: any,
      event: string,
      reason: string,
      data: any,
      client: any,
    ) {
      trace.push(["telemetry", event, reason, data, client]);
      if (mode === "telemetry-error") throw new Error("telemetry");
    },
  };
  const original = originalServiceBindings(["Jee", "Zee"], {
    xt: metadataSession,
    Me: codexTurnMetadata,
    Rc: classifyAuthCredentialFields,
    nN: allowsOrdinaryCredentialOption,
    pc: authSubmissionOrigin,
    za: inspectAuthFields,
    vf: readAuthSubmissionOrigin,
    Cf: isCredentialDocumentContained,
    J_: nativeAuthSubmit,
    jn() {},
    Eh: telemetry,
  });
  const fn = binding
    ? source
      ? original.Zee
      : createAuthCredentialBinding
    : source
      ? original.Jee
      : createManualSavePreflight(() => telemetry);
  let result: any;
  try {
    result = await (binding
      ? fn(request, fields, origin, frameOrigin, context)
      : fn(request, fields, challenge, false, origin, frameOrigin, context));
  } catch (error) {
    result = { error: (error as Error).message };
  }
  await new Promise((resolve) => setImmediate(resolve));
  return JSON.parse(JSON.stringify({ result, trace }));
}
test("manual save binding matches original private/ordinary preflight and telemetry boundaries", async () => {
  for (const ordinary of [false, true])
    for (const mode of [
      "normal",
      "session",
      "long-session",
      "subagent",
      "field-count",
      "optional",
      "challenge-count",
      "challenge-optional",
      "missing-submit",
      "qr",
      "origin",
      "http",
      "username",
      "password",
      "mapping",
      "names",
      "options",
      "password-only",
      "target",
      "child-frame",
      "service-worker",
      "reinspect",
      "metadata",
      "native-error",
      "native-false",
      "telemetry-error",
    ])
      assert.deepEqual(
        await run(false, mode, ordinary),
        await run(true, mode, ordinary),
        `${mode}/${ordinary}`,
      );
  assert.equal((await run(false, "normal", false)).result.kind, "private");
  assert.equal((await run(false, "normal", true)).result.kind, "ordinary");
  assert.equal(
    (await run(false, "password-only", true)).result.fields.password,
    "p",
  );
  assert.equal((await run(false, "native-error", false)).result, undefined);
});
test("credential binding matches original session, options and HTTPS submission gates", async () => {
  for (const mode of [
    "normal",
    "session",
    "long-session",
    "subagent",
    "qr",
    "origin",
    "http",
    "username",
    "password",
    "options",
    "target",
    "missing-submit",
  ])
    assert.deepEqual(
      await run(false, mode, false, true),
      await run(true, mode, false, true),
      mode,
    );
  assert.equal(
    (await run(false, "subagent", false, true)).result.session_id,
    "child",
  );
});

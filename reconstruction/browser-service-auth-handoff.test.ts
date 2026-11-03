import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import { createBrowserAuthHandoff } from "../packages/browser/src/service/browser_auth/handoff";
import { defineCommand } from "../packages/browser/src/service/commands/define_command";
import { TabBrowserAuthCommands } from "../packages/browser/src/commands/browser_auth";
import * as plan from "../packages/browser/src/service/browser_auth/field_plan";
const aliases = {
  $D: "closeCredentialLease",
  Ch: "revalidatePage",
  ID: "reviewSafety",
  Jee: "manualSavePreflight",
  Ka: "readPageBinding",
  Lt: "parseUrl",
  Me: "turnMetadata",
  On: "authCapability",
  Ph: "validOptions",
  QM: "revalidateLocators",
  Qee: "validIntermediateFrames",
  RD: "hasNestedFrames",
  Rh: "readFormBinding",
  Rs: "backendApiUrl",
  SB: "validObservationPredecessor",
  Sv: "isQrOnly",
  Th: "completeChallenge",
  VD: "startCredentialLease",
  WD: "startQrMonitor",
  ZM: "captureScreenshot",
  Zee: "createCredentialBinding",
  aN: "createFieldPlan",
  ai: "unsupportedCapability",
  ci: "currentReviewHost",
  dc: "readActionTargets",
  eD: "createSafetyPrecheck",
  ete: "isElicitationUnavailable",
  iN: "readOptionBindings",
  mf: "backendFetch",
  nN: "allowsOrdinaryOption",
  nt: "browserName",
  nte: "firstInvisibleField",
  ote: "validLocatorLayout",
  ste: "mapOptions",
  ute: "submitValues",
  wv: "sameSite",
  xf: "decodeQr",
  xt: "metadataSession",
  yv: "Checkpoint",
  za: "inspectFields",
  ze: "httpOrigin",
  jn: "initializeTelemetry",
  Eh: "telemetry",
};
async function run(source: boolean, mode: string) {
  const trace: any[] = [];
  const protectedModes = [
    "private",
    "private-reject",
    "private-start-error",
    "ordinary",
    "ordinary-failure",
    "native",
    "session-change",
    "predecessor-error",
  ];
  const protectedMode = protectedModes.includes(mode);
  const fields: any[] = [
    {
      id: "user",
      selector: "#u",
      type: "text",
      required: true,
      labelMetadata: {
        accessible_name: "User",
        autocomplete: "username",
        input_type: "text",
        input_name: "user",
      },
    },
    {
      id: "pass",
      selector: "#p",
      type: "password",
      required: true,
      labelMetadata: {
        accessible_name: "Password",
        autocomplete: null,
        input_type: "password",
        input_name: "pass",
      },
    },
  ];
  const request: any = {
    browser_id: "fixture",
    tab_id: "7",
    origin: "https://fixture.test",
    fields,
    submit: { selector: "#submit", action: "click" },
  };
  if (mode.startsWith("qr")) {
    request.fields = [];
    delete request.submit;
    request.qr_code = true;
  }
  if (mode === "otp-invalid") request.otpHandle = "synthetic-handle";
  if (mode === "options")
    request.options = [
      { id: "option", label: "Login", field_ids: ["user", "pass"] },
    ];
  let submit!: (value: any) => void;
  const pending = new Promise((resolve) => {
    submit = resolve;
  });
  const challenge: any = {
    id: "challenge",
    hasSubmission: false,
    waitForSubmission() {
      trace.push("wait");
      return pending;
    },
    async complete(status: string, password?: boolean) {
      trace.push(["complete", status, password]);
      submit({ status });
      return status;
    },
    close() {
      trace.push("close");
    },
  };
  const context: any = {
    clientInfo: {
      name: "Fixture",
      type: "fixture",
      capabilities: { tab: mode === "unsupported" ? [] : [{ id: "auth" }] },
    },
    runtime: {
      env: {},
      requestMeta: {},
      async createElicitation(input: any) {
        trace.push(["elicit", input]);
        if (mode === "elicit-error") {
          throw new Error("elicitation failure");
        }
        if (
          [
            "accept",
            "submission-fails",
            "native-unavailable",
            "manual-unavailable",
            "options",
            ...protectedModes,
          ].includes(mode)
        ) {
          challenge.hasSubmission = true;
          submit({
            fields: { user: "synthetic-user", pass: "synthetic-password" },
            selected_option: mode === "options" ? "option" : undefined,
            native_credential_delivery:
              mode === "native-unavailable" || mode === "native",
            manual_credential_save:
              mode === "manual-unavailable" ||
              (protectedMode &&
                mode !== "native" &&
                !mode.startsWith("ordinary")),
            ordinary_credential_delivery: mode.startsWith("ordinary"),
            native_observation_predecessor: null,
          });
          return { action: "accept" };
        }
        return {
          action: mode === "cancel" ? "cancel" : "decline",
          _meta:
            mode === "unsupported-client"
              ? { "openai/client_unsupported": true }
              : mode === "takeover"
                ? { "openai/user_took_over": true }
                : mode === "qr-mobile"
                  ? { "openai/client_is_mobile": true }
                  : undefined,
        };
      },
      gaas: {
        async getBrowserAuthBrokerChallenge(...args: any[]) {
          trace.push(["broker", ...args]);
          if (mode === "broker-error") throw new Error("broker");
          return challenge;
        },
      },
    },
    security: {
      async currentTabUrl() {
        trace.push("url");
        return request.origin;
      },
    },
    acquireAuthority() {
      return {
        actInFrame(url: string) {
          trace.push(["authority", url]);
          return {
            async assert() {
              if (mode === "authority-error") throw new Error("authority");
            },
          };
        },
      };
    },
    commandTiming: {
      trackElicitation(fn: Function) {
        trace.push("track");
        return fn;
      },
    },
    performanceSpan: {
      withSpan(_name: string, _attrs: any, callback: Function) {
        return callback();
      },
    },
    documentResponses: {},
    cdp: {},
  };
  if (mode === "missing-elicitation") delete context.runtime.createElicitation;
  const page = {
    frameId: "root",
    loaderId: "loader",
    url: request.origin,
    securityOrigin: request.origin,
    domainAndRegistry: "fixture.test",
  };
  const deps: any = {
    validLocatorLayout: () => mode !== "layout",
    readPageBinding: async () =>
      mode === "page-origin" ? "origin_changed" : page,
    httpOrigin: (value: string) => value,
    firstInvisibleField: async () => (mode === "invisible" ? "user" : null),
    createSafetyPrecheck: () => (mode === "safety" ? () => {} : undefined),
    isQrOnly: plan.isQrOnlyAuth,
    inspectFields: async () => fields,
    validOptions: async () => mode !== "invalid-options",
    readFormBinding: async () =>
      mode === "missing-form" ? null : { ...page, origin: request.origin },
    hasNestedFrames: () => false,
    readActionTargets: async () => ({
      options: [],
      submissionOrigin: request.origin,
    }),
    readOptionBindings: async () => new Map(),
    sameSite: () => true,
    validIntermediateFrames: async () => true,
    revalidatePage: async () => (mode === "revalidate" ? "page_changed" : null),
    createFieldPlan: plan.createAuthFieldPlan,
    turnMetadata: () => ({ session_id: "session" }),
    metadataSession: (meta: any) => meta.session_id,
    mapOptions: plan.mapAuthOptions,
    Checkpoint: class {
      nativeDelivery = false;
      manualCredentialSave = false;
      constructor(..._args: any[]) {}
    },
    browserName: () => "Fixture",
    authCapability: { id: "auth" },
    unsupportedCapability: (name: string, cmd: any) =>
      new Error(`${name}/${cmd.type}`),
    currentReviewHost: () => undefined,
    reviewSafety: async () => null,
    captureScreenshot: async () => ({
      url: "data:image/jpeg;base64,synthetic",
    }),
    revalidateLocators: async () => null,
    decodeQr: async () =>
      mode === "qr-unavailable"
        ? undefined
        : {
            payload: "https://fixture.test/qr",
            bounds: { x: 0, y: 0, width: 1, height: 1 },
          },
    parseUrl: (value: string) => new URL(value),
    createCredentialBinding: async () => undefined,
    manualSavePreflight: async () => undefined,
    allowsOrdinaryOption: plan.allowsOrdinaryCredentialOption,
    validObservationPredecessor: () => true,
    startCredentialLease: async () => undefined,
    closeCredentialLease: async () => {
      trace.push("close-lease");
    },
    startQrMonitor: () => ({
      stop() {
        trace.push("stop-qr");
      },
    }),
    submitValues: async () => {
      trace.push("submit");
      return mode === "submission-fails" ? "submission_failed" : "submitted";
    },
    completeChallenge: plan.completeAuthChallenge,
    initializeTelemetry() {},
    telemetry: { logStatsigEvent() {} },
    backendApiUrl: () => "https://fixture.test",
    backendFetch: async () => {
      throw new Error("unexpected fetch");
    },
    isElicitationUnavailable: () => false,
  };
  if (protectedMode) {
    context.runtime.env.BROWSER_AUTH_BROKER_CREDENTIAL_BINDING_VERSION =
      mode.startsWith("ordinary") ? "2" : "1";
    context.runtime.env.BROWSER_AUTH_BROKER_MANUAL_SAVE_BINDING_VERSION =
      mode.startsWith("ordinary") ? "10" : "8";
    context.credentialObservationGate = {
      async protect(...args: any[]) {
        trace.push(["protect", args[0]]);
        return "private-token";
      },
      async protectManualSaving(tab: number, _finish: any, kind: string) {
        trace.push(["protect-save", tab, kind]);
        return "save-token";
      },
      allowPrivateInteraction(...args: any[]) {
        trace.push(["allow-private", ...args]);
      },
      allowOrdinaryInteraction(...args: any[]) {
        trace.push(["allow-ordinary", ...args]);
      },
    };
    context.cdp.protectBrowserAuthCredentialDiagnostics = (tab: number) =>
      trace.push(["protect-diagnostics", tab]);
    deps.createCredentialBinding = async () => ({
      session_id: "session",
      submission_origin: request.origin,
    });
    deps.manualSavePreflight = async () => ({
      kind: mode.startsWith("ordinary") ? "ordinary" : "private",
      fields: { username: "user", password: "pass" },
      sessionId: "session",
      names: { username: "username", password: "password" },
      target: { origin: request.origin, url: request.origin + "/submit" },
      submission: { fixture: true },
    });
    deps.validObservationPredecessor = (...args: any[]) => {
      trace.push(["predecessor", ...args]);
      if (mode === "predecessor-error") throw new Error("predecessor");
      return true;
    };
    deps.startCredentialLease = async (input: any) => {
      trace.push([
        "lease-start",
        input.tabId,
        input.frameId,
        input.target,
        input.ordinary,
        input.credentialFields,
      ]);
      if (mode === "private-start-error") throw new Error("lease start");
      return {
        currentRejection() {
          return null;
        },
        diagnostics() {
          return { request_id: "request", attempt_events: [] };
        },
        recordAttempt(event: any) {
          trace.push(["attempt", event]);
        },
        whenRejected() {
          return mode === "private-reject"
            ? Promise.resolve("origin_changed")
            : new Promise(() => {});
        },
        async ordinaryResult() {
          trace.push("ordinary-result");
          return mode === "ordinary-failure"
            ? "submission_failed"
            : "submitted";
        },
        async result(timeout: number) {
          trace.push(["private-result", timeout]);
          return "submitted";
        },
        async waitForOrdinaryDocumentCleanup() {
          trace.push("cleanup-document");
        },
        settleOrdinarySubmission() {
          trace.push("settle-ordinary");
        },
        completeOrdinaryAttempt(status: string) {
          trace.push(["attempt-complete", status]);
        },
        async close() {
          trace.push("lease-close");
        },
      };
    };
    deps.submitValues = async () => {
      trace.push("submit");
      if (mode === "session-change")
        deps.turnMetadata = () => ({ session_id: "other" });
      await Promise.resolve();
      await Promise.resolve();
      return "submitted";
    };
    if (mode === "session-change") deps.metadataSession = () => "other";
  }
  const external: any = {
    F: defineCommand,
    mr: TabBrowserAuthCommands,
    bv: "Sign in to continue",
    Xee: "openai/user_took_over",
  };
  for (const [symbol, name] of Object.entries(aliases))
    external[symbol] = deps[name];
  const command = source
    ? originalServiceBindings(["rN"], external).rN
    : createBrowserAuthHandoff(deps);
  let result: any;
  try {
    result = await command(request, context);
  } catch (error) {
    result = { error: (error as Error).message };
  }
  return JSON.parse(JSON.stringify({ result, trace }));
}
test("full auth handoff matches original gates, broker prompt and submission lifecycle", async () => {
  for (const mode of [
    "decline",
    "cancel",
    "accept",
    "submission-fails",
    "native-unavailable",
    "manual-unavailable",
    "options",
    "unsupported",
    "layout",
    "page-origin",
    "invisible",
    "invalid-options",
    "missing-form",
    "revalidate",
    "otp-invalid",
    "missing-elicitation",
    "broker-error",
    "elicit-error",
    "unsupported-client",
    "takeover",
    "qr",
    "qr-mobile",
    "qr-unavailable",
    "safety",
    "authority-error",
  ])
    assert.deepEqual(await run(false, mode), await run(true, mode), mode);
  assert.equal((await run(false, "accept")).result.status, "submitted");
  assert.equal(
    (await run(false, "submission-fails")).result.status,
    "submission_failed",
  );
  assert.equal((await run(false, "takeover")).result.reason, "user_took_over");
  assert.equal((await run(false, "options")).result.selected_option, "option");
  assert.ok((await run(false, "accept")).trace.includes("close"));
});

test("assembled handoff uses restored binding, screenshot and challenge completion for QR flow", async () => {
  const { assembleBrowserAuthHandoff } =
    await import("../packages/browser/src/service/browser_auth/handoff_assembly");
  const { browserAuthTabCapabilityDefinition } =
    await import("../packages/browser/src/capabilities/tab_browser_auth");
  const trace: any[] = [];
  let settle!: (result: any) => void;
  const waiting = new Promise((resolve) => {
    settle = resolve;
  });
  const challenge = {
    id: "qr-challenge",
    hasSubmission: false,
    waitForSubmission() {
      return waiting;
    },
    async complete(status: string) {
      trace.push(["complete", status]);
      settle({ status });
      return status;
    },
    close() {
      trace.push("closed");
    },
  };
  const context: any = {
    browserId: "fixture",
    clientInfo: {
      name: "fixture",
      type: "fixture",
      capabilities: { tab: [{ id: browserAuthTabCapabilityDefinition.id }] },
    },
    runtime: {
      env: {},
      async createElicitation(prompt: any) {
        trace.push(["prompt", prompt.meta.qr_code_payload]);
        return { action: "decline" };
      },
      gaas: {
        async getBrowserAuthBrokerChallenge() {
          return challenge;
        },
      },
    },
    commandTiming: {
      trackElicitation(fn: any) {
        return fn;
      },
    },
    performanceSpan: {
      withSpan(_name: any, _attrs: any, run: Function) {
        return run();
      },
    },
    security: {
      async currentTabUrl() {
        return "https://fixture.test";
      },
    },
    acquireAuthority() {
      return {
        actInFrame() {
          return {
            async assert() {
              trace.push("authority");
            },
          };
        },
      };
    },
    cdp: {
      async withInternalScreencast() {
        return undefined;
      },
      async call(_tab: number, method: string) {
        trace.push(method);
        if (method === "Page.getFrameTree")
          return {
            frameTree: {
              frame: {
                id: "root",
                loaderId: "loader",
                url: "https://fixture.test/",
                securityOrigin: "https://fixture.test",
                domainAndRegistry: "fixture.test",
              },
            },
          };
        if (method === "Page.getLayoutMetrics")
          return {
            cssVisualViewport: {
              pageX: 0,
              pageY: 0,
              clientWidth: 100,
              clientHeight: 80,
            },
          };
        return { data: "synthetic" };
      },
    },
  };
  const command = assembleBrowserAuthHandoff({
    reviewSafety: async () => null,
    telemetry: { logStatsigEvent() {} },
    qr: {
      async decode(url: string) {
        assert.equal(url, "data:image/jpeg;base64,synthetic");
        return {
          payload: "https://fixture.test/qr",
          bounds: { x: 0, y: 0, width: 1, height: 1 },
        };
      },
      start() {
        throw new Error("unexpected monitor");
      },
    },
  });
  const result = await command(
    {
      browser_id: "fixture",
      tab_id: "7",
      origin: "https://fixture.test",
      fields: [],
      qr_code: true,
    },
    context,
  );
  assert.equal(result.status, "declined");
  assert.ok(trace.includes("Page.captureScreenshot"));
  assert.ok(trace.includes("closed"));
  assert.ok(
    trace.some(
      (entry) =>
        Array.isArray(entry) &&
        entry[0] === "prompt" &&
        entry[1] === "https://fixture.test/qr",
    ),
  );
});

test("auth handoff matches original protected credential leases and cleanup", async () => {
  for (const mode of [
    "private",
    "private-reject",
    "private-start-error",
    "ordinary",
    "ordinary-failure",
    "native",
    "session-change",
    "predecessor-error",
  ])
    assert.deepEqual(await run(false, mode), await run(true, mode), mode);
  const ordinary = await run(false, "ordinary");
  assert.equal(ordinary.result.status, "submitted");
  assert.ok(
    ordinary.trace.some(
      (entry: any) =>
        Array.isArray(entry) &&
        entry[0] === "allow-ordinary" &&
        entry[3] === true,
    ),
  );
  assert.ok(ordinary.trace.includes("cleanup-document"));
  assert.equal(
    (await run(false, "ordinary-failure")).result.status,
    "submission_failed",
  );
  assert.equal(
    (await run(false, "private-reject")).result.status,
    "origin_changed",
  );
  assert.equal(
    (await run(false, "private-start-error")).result.status,
    "unavailable",
  );
  assert.ok(
    !(await run(false, "session-change")).trace.some(
      (entry: any) => Array.isArray(entry) && entry[0] === "allow-private",
    ),
  );
  assert.ok(
    (await run(false, "native")).trace.some(
      (entry: any) => Array.isArray(entry) && entry[0] === "allow-private",
    ),
  );
});

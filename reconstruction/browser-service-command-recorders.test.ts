import assert from "node:assert/strict";
import test from "node:test";
import {
  createCommandRecording,
  createWebMcpRecorder,
  recordedWebMcpCalls,
  serializeRecordedValue,
  cloudHandoffTarget,
  emitCloudHandoff,
} from "../packages/browser/src/service/runtime/command_recorders";
import {
  WebMcpListTools,
  WebMcpInvokeTool,
} from "../packages/browser/src/commands/web_mcp";
import { codexTurnMetadata } from "../packages/browser/src/service/preferences/request_context";
import { originalServiceBindings } from "./service-source";
function original(deps: any) {
  return originalServiceBindings(
    [
      "Mue",
      "Nue",
      "Uue",
      "que",
      "Fue",
      "Lue",
      "Oue",
      "wx",
      "Z3",
      "Q3",
      "t6",
      "e6",
      "n6",
      "jue",
      "Hue",
      "o6",
      "r6",
    ],
    {
      oe: { WebMcpListTools, WebMcpInvokeTool },
      Me: codexTurnMetadata,
      Je: deps.canObserve,
      Fi: deps.ensureResumed,
      $o: deps.shouldEmitResponseMetadata,
      $3: deps.captureResponseScreenshot,
      bu: deps.emitResponseMetadata,
    },
  );
}
function fixture(useOriginal: boolean, flags: any = {}) {
  const trace: any[] = [];
  const hooks: any[] = [];
  let allowed = true;
  const runtime: any = {
    requestMeta: { "x-codex-turn-metadata": { session_id: "connection" } },
    addAfterSubmittedCodeHook(h: any) {
      hooks.push(h);
      trace.push(["hook", h.timeoutMs]);
    },
    async assertBrowserAccess() {
      trace.push(["access"]);
      if (flags.accessError) throw Error("access");
    },
    setResponseMeta(m: any) {
      trace.push(["meta", m]);
    },
    emitContentItem(c: any) {
      trace.push(["content", c]);
    },
  };
  const deps: any = {
    canObserve: (ctx: any) => allowed && !ctx?.protected,
    async ensureResumed() {
      trace.push(["resume"]);
      if (flags.resumeError) throw Error("resume");
    },
    async shouldEmitResponseMetadata(ctx: any) {
      trace.push(["canEmit", ctx.browserId]);
      return !flags.noEmit && allowed && !ctx.protected;
    },
    async captureResponseScreenshot(o: any) {
      trace.push(["screenshot", o.context.browserId, o.commandType]);
      if (flags.captureError) throw Error("capture");
      if (flags.protectDuringCapture) allowed = false;
      return {
        browserId: o.context.browserId,
        screenshot: { url: "synthetic" },
      };
    },
    emitResponseMetadata(_r: any, b: any, d: any) {
      trace.push(["emit", b, d]);
    },
  };
  const orig = original(deps);
  const f = useOriginal
    ? {
        createNavigationRecorder: orig.Z3,
        createInteractionRecorder: orig.Q3,
        createCommandRecorder: orig.t6,
        createResponseRecorder: orig.n6,
      }
    : createCommandRecording(deps);
  function outcome(options: any = {}) {
    return {
      backend: "cdp",
      commandSucceeded: true,
      currentUrl: "https://one.invalid/path",
      params: { tab_id: "3" },
      result: { ok: true },
      runtime,
      context: {
        browserId: "one",
        clientInfo: { family: "chromium" },
        environment: "cloud",
        getCurrentSessionId: () => "conversation",
        siteInstructions: {
          take: (tab: any, url: any) => {
            trace.push(["site", tab, url]);
            if (flags.siteError) throw Error("site");
            return flags.siteGuidance ? "instruction" : undefined;
          },
        },
        performanceSpan: {
          async withSpan(name: any, attrs: any, fn: any) {
            trace.push(["span", name]);
            return fn();
          },
        },
      },
      ...options,
    };
  }
  return {
    trace,
    hooks,
    runtime,
    f,
    outcome,
    setAllowed: (v: boolean) => (allowed = v),
    orig,
  };
}
function normalized(value: any) {
  return JSON.parse(
    JSON.stringify(value, (_k, v) =>
      typeof v === "function" ? "function" : v,
    ),
  );
}
async function attempt(fn: any) {
  try {
    return { value: await fn() };
  } catch (e: any) {
    return { error: e.message };
  }
}
async function recorderScenario(source: boolean, kind: string, flags: any) {
  const f = fixture(source, flags);
  const recorder =
    kind === "nav"
      ? f.f.createNavigationRecorder()
      : kind === "interaction"
        ? f.f.createInteractionRecorder()
        : f.f.createResponseRecorder();
  const one = f.outcome();
  if (flags.orbit) one.context.environment = "orbit";
  const two = f.outcome({
    params: { tab_id: 4 },
    currentUrl: flags.multi
      ? "https://two.invalid/"
      : "https://one.invalid/other",
  });
  if (flags.protected) two.context.protected = true;
  recorder.recordCommand("tab_screenshot", one);
  recorder.recordCommand("cua_click", {
    ...two,
    commandSucceeded: !flags.failed,
  });
  recorder.recordCommand(WebMcpInvokeTool.commandType, {
    ...one,
    params: { tool_name: "tool", input: { arg: 1 } },
    webMcpTool: { origin: "https://tool.invalid/", title: "Tool" },
  });
  if (flags.handoff)
    recorder.recordCommand("tab_manual_handoff_request", {
      ...one,
      currentUrl: undefined,
    });
  const first = await attempt(() => recorder.takeResponseMetaContribution()),
    second = await attempt(() => recorder.takeResponseMetaContribution());
  return normalized({ first, second, trace: f.trace });
}
test("navigation, screenshot and WebMCP recorder state matches original", async () => {
  for (const kind of ["nav", "interaction", "webmcp"])
    for (const flags of [
      {},
      { multi: true },
      { orbit: true },
      { protected: true },
      { failed: true },
      { handoff: true },
      { multi: true, handoff: true, siteGuidance: true },
      { captureError: true },
      { siteError: true },
    ])
      assert.deepEqual(
        await recorderScenario(false, kind, flags),
        await recorderScenario(true, kind, flags),
        `${kind}/${JSON.stringify(flags)}`,
      );
  const f = fixture(false, { multi: true });
  const r = f.f.createNavigationRecorder();
  r.recordCommand("known", f.outcome());
  r.recordCommand("known", f.outcome({ currentUrl: "https://two.invalid/" }));
  const contribution = await r.takeResponseMetaContribution();
  assert.deepEqual(contribution.outcome.params, {});
  assert.equal(contribution.outcome.currentUrl, undefined);
  assert.equal(await r.takeResponseMetaContribution(), undefined);
});
async function aggregateScenario(source: boolean, flags: any) {
  const f = fixture(source, flags);
  const nav = f.f.createNavigationRecorder(),
    interaction = f.f.createInteractionRecorder(),
    web = f.f.createResponseRecorder();
  const recorder = f.f.createCommandRecorder([nav, interaction], f.runtime);
  recorder.register(web);
  const one = f.outcome();
  if (flags.orbit) one.context.environment = "orbit";
  if (flags.protected) one.context.protected = true;
  recorder.recordCommand("cua_click", one);
  recorder.recordCommand(WebMcpInvokeTool.commandType, {
    ...one,
    params: { tab_id: "3", tool_name: "tool", input: { x: 1 } },
    webMcpTool: { origin: "https://tool.invalid/" },
  });
  if (flags.handoff) recorder.recordCommand("tab_manual_handoff_request", one);
  if (flags.differentBrowser) {
    const other = f.outcome();
    other.context.browserId = "two";
    recorder.recordCommand("cua_type", other);
  }
  const first = await attempt(() => f.hooks[0].run()),
    second = await attempt(() => f.hooks[0].run());
  return normalized({ trace: f.trace, first, second });
}
test("combined recorder matches original priority, merge scope, access checks and protected handoff", async () => {
  for (const flags of [
    {},
    { handoff: true },
    { orbit: true, handoff: true },
    { protected: true },
    { protected: true, handoff: true, orbit: true },
    { differentBrowser: true },
    { differentBrowser: true, handoff: true },
    { siteGuidance: true },
    { accessError: true },
    { noEmit: true },
    { captureError: true },
    { protectDuringCapture: true },
    { protected: true, handoff: true, resumeError: true },
  ])
    assert.deepEqual(
      await aggregateScenario(false, flags),
      await aggregateScenario(true, flags),
      JSON.stringify(flags),
    );
  const protectedResult = await aggregateScenario(false, {
    protected: true,
    handoff: true,
    orbit: true,
  });
  assert.equal(
    protectedResult.trace.filter((x: any) => x[0] === "emit").length,
    1,
  );
  assert.equal(
    protectedResult.trace.filter((x: any) => x[0] === "content").length,
    1,
  );
  assert(!protectedResult.trace.some((x: any) => x[0] === "screenshot"));
});
test("WebMCP history preserves reverse budget allocation, truncation and serialization failures", () => {
  const f = fixture(false);
  const circular: any = {};
  circular.self = circular;
  for (const value of [
    undefined,
    null,
    1,
    "汉字",
    "x".repeat(100_010),
    1n,
    circular,
  ])
    for (const budget of [0, 1, 2, 8, 100_000])
      assert.deepEqual(
        serializeRecordedValue(value, budget),
        f.orig.r6(value, budget),
      );
  const outcomes = [
    f.outcome({
      commandType: WebMcpListTools.commandType,
      result: ["x".repeat(90_000)],
    }),
    f.outcome({
      commandType: WebMcpInvokeTool.commandType,
      params: { tool_name: "tool", input: "汉".repeat(60_000) },
      result: "x".repeat(60_000),
      webMcpTool: {
        origin: "https://tool.invalid:123/path",
        annotations: { readOnlyHint: false },
      },
    }),
  ];
  const actual = recordedWebMcpCalls(outcomes);
  assert.deepEqual(actual, f.orig.jue(outcomes));
  assert.equal(actual[0].outputTruncated, true);
  assert.equal(actual[0].outputJson, undefined);
  assert.equal(actual[1].outputTruncated, true);
  assert.equal(actual[1].sourceHostname, "tool.invalid");
  const recorder = createWebMcpRecorder();
  for (const o of outcomes) recorder.recordCommand(o.commandType, o);
  assert.deepEqual(
    recorder.takeResponseMetaContribution()?.surfaceDetails.webMcpCalls,
    actual,
  );
  assert.equal(recorder.takeResponseMetaContribution(), undefined);
});
test("handoff target and emitted URL match original metadata and raw string semantics", () => {
  const f = fixture(false);
  for (const backend of ["cdp", "chrome"])
    for (const environment of ["orbit", "cloud"])
      for (const tab of ["3", "", 3])
        for (const metadata of [
          undefined,
          { session_id: "connection" },
          { session_id: "" },
          { session_id: 123 },
        ]) {
          const o = f.outcome({ backend, params: { tab_id: tab } });
          o.context.environment = environment;
          o.runtime = { requestMeta: { "x-codex-turn-metadata": metadata } };
          assert.deepEqual(cloudHandoffTarget(o), f.orig.wx(o));
          const target = cloudHandoffTarget(o);
          const a: any[] = [],
            b: any[] = [];
          emitCloudHandoff(
            { emitContentItem: (item: any) => a.push(item) },
            target,
          );
          f.orig.e6({ emitContentItem: (item: any) => b.push(item) }, target);
          assert.deepEqual(a, b);
        }
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleCommandRuntime,
  isBrowserBackendAlias,
  browserTelemetryAttributes,
} from "../packages/browser/src/service/runtime/command_runtime_assembly";
import { createServiceRpcDispatcher } from "../packages/browser/src/service/rpc_dispatch";
import { originalServiceBindings } from "./service-source";
test("assembly aliases and telemetry attributes match original service symbols", () => {
  const original = originalServiceBindings(["Wy", "vh"]);
  for (const value of [
    "extension",
    "chrome",
    "iab",
    "dot",
    "cdp",
    "mcpapps",
    "unknown",
    null,
    1,
  ])
    assert.equal(isBrowserBackendAlias(value), original.Wy(value));
  for (const type of ["extension", "iab", "cdp", "mcpapps", undefined])
    for (const family of [undefined, null, "chrome", "edge", ""])
      assert.deepEqual(
        browserTelemetryAttributes({ type, family }),
        original.vh({ type, family }),
      );
});
test("RPC dispatcher connects assembled runtime, real context/registry, documentation and notifications", async () => {
  const trace: any[] = [];
  const hooks: any[] = [];
  let closed = 0;
  const info = {
    type: "cdp",
    name: "Synthetic",
    family: "chromium",
    capabilities: { browser: [], tab: [] },
  };
  const api: any = {
    addEventListener(name: any) {
      trace.push(["listen", name]);
    },
    addCloseListener() {
      return () => {};
    },
    getCurrentSessionId() {
      return "runtime-assembly";
    },
    getCurrentTurnId() {
      return "turn";
    },
    async getInfo() {
      return info;
    },
    async getTabs() {
      trace.push(["tabs"]);
      return [{ id: 3, title: "Fixture", url: "https://fixture.invalid/" }];
    },
    takePageEvents() {
      return [];
    },
    matchesCurrentSessionId() {
      return true;
    },
    async getSessionTab() {
      return null;
    },
    async close() {
      closed++;
    },
  };
  const browser = { id: "assembly-browser", info, api };
  const directory = {
    async refresh() {
      trace.push(["refresh"]);
    },
    async list() {
      return [{ id: browser.id, ...info }];
    },
    async get(id: any) {
      trace.push(["directory.get", id]);
      return browser;
    },
    preferredWindowIdFor() {
      return undefined;
    },
    async dispose() {
      trace.push(["directory.dispose"]);
    },
  };
  const span = {
    async withSpan(_name: any, _attrs: any, run: any) {
      return run();
    },
    async withCommandTelemetry(_type: any, _params: any, run: any) {
      return run();
    },
  };
  const host: any = {
    env: { BROWSER_USE_DISABLE_TAB_CAPABILITIES: "webMcp" },
    requestMeta: {
      "x-codex-turn-metadata": {
        session_id: "runtime-assembly",
        turn_id: "turn",
        thread_id: "thread",
      },
    },
    platform: "darwin",
    config: {},
    filesystem: {},
    browserContext: directory,
    performanceSpan: span,
    errorReporter: { captureException() {} },
    commandTiming: {
      startCommand() {
        return {
          async run(fn: any) {
            return fn();
          },
          finish(outcome: any) {
            trace.push(["finish", outcome]);
          },
        };
      },
    },
    addAfterSubmittedCodeHook(h: any) {
      hooks.push(h);
    },
    async assertBrowserAccess() {
      trace.push(["access"]);
    },
    setResponseMeta(meta: any) {
      trace.push(["meta", meta]);
    },
    emitContentItem(item: any) {
      trace.push(["content", item]);
    },
  };
  const unused = () => {
    throw Error("unexercised host integration");
  };
  const assembly = assembleCommandRuntime({
    context: {
      injectedSource: "/* fixture: no injected operation requested */",
      reportError: unused,
      reportEvent() {},
      createLocalizer: () => () => "fixture",
    },
    commands: {
      typeText: unused,
      emitBotDetection: unused,
      webMcp: {
        isLocalRuntime: () => true,
        featureFlag: async () => false,
        config: () => ({}),
        emit: unused,
      },
      browserAuth: {
        reviewSafety: unused,
        qr: { decode: unused, start: unused },
        telemetry: {} as any,
      },
    },
    documentation: {
      moduleUrl: "file:///synthetic/scripts/service.mjs",
      bundle: {
        default: {
          apiManifest: {
            root: "Browser",
            interfaces: { Browser: {} },
            types: {},
          },
          documentManifest: [
            { name: "intro", mode: "included", requiredFor: ["list_tabs"] },
          ],
          documentation: { intro: "Synthetic browser instructions" },
        },
      },
    },
    telemetry: {
      setExceptionReporter() {},
      configureRuntimeTelemetry() {},
      emitEvent(_r: any, event: any) {
        trace.push(["event", event]);
      },
      reportNotificationError(error: any) {
        trace.push(["notification.error", String(error)]);
      },
      configureBackendTelemetry() {},
      configureTurnTelemetry() {},
    },
  });
  const rpc = createServiceRpcDispatcher({
    createHostRuntime: () => host,
    initializeRuntime: assembly.createRuntime,
    withSpan: span.withSpan,
  });
  const setup: any = await rpc({
    method: "setup",
    params: { environment: "orbit" },
  });
  assert.equal(setup.credentialRecoveryErrorVersion, 1);
  const inventory: any = await rpc({
    method: "execute",
    params: { type: "list_browsers" },
  });
  assert.equal(inventory[0].id, "assembly-browser");
  await assert.rejects(
    rpc({
      method: "execute",
      params: { type: "list_tabs", browser_id: "assembly-browser" },
    }),
    /Required documentation has not been read/,
  );
  assert.equal(trace.filter((x) => x[0] === "listen").length, 0);
  const docs: any = await rpc({
    method: "execute",
    params: {
      type: "get_browser_documentation",
      browser_id: "assembly-browser",
    },
  });
  assert(docs.includes("Synthetic browser instructions"));
  const tabs: any = await rpc({
    method: "execute",
    params: { type: "list_tabs", browser_id: "assembly-browser" },
  });
  assert.deepEqual(tabs.tabs, [
    {
      id: "3",
      providerTabId: undefined,
      url: "https://fixture.invalid/",
      title: "Fixture",
    },
  ]);
  assert(trace.some((x) => x[0] === "listen" && x[1] === "onCDPEvent"));
  const again: any = await rpc({
    method: "executeWithRecovery",
    params: { type: "list_tabs", browser_id: "assembly-browser" },
  });
  assert.equal(again.ok, true);
  assert.equal(
    trace.filter((x) => x[0] === "listen" && x[1] === "onCDPEvent").length,
    1,
  );
  assert.equal(hooks.length, 2);
  await hooks[0].run();
  await hooks[1].run();
  assert(!trace.some((x) => x[0] === "notification.error"));
  assert(
    trace.some(
      (x) =>
        x[0] === "meta" &&
        x[1]["codex/toolSurface"]?.browserId === "assembly-browser",
    ),
  );
  await assembly.dispose();
  assert.equal(closed, 1);
  await assert.rejects(
    rpc({
      method: "execute",
      params: { type: "list_tabs", browser_id: "assembly-browser" },
    }),
    /disposed/,
  );
});

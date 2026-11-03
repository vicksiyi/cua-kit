import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserContextClass } from "../packages/browser/src/service/context/browser_context";
import { originalServiceBindings } from "./service-source";
const symbols = {
  Preferences: "lu",
  Cdp: "qh",
  Clipboard: "Eg",
  BrowserUser: "lg",
  Ui: "bg",
  Cua: "cg",
  Dev: "dg",
  Tabs: "gg",
  TabLifecycle: "Tg",
  Playwright: "ig",
  Security: "yf",
  DocumentResponses: "Xh",
  Downloads: "pg",
  SiteInstructions: "mg",
  PageAssets: "hg",
  Accessibility: "Kh",
  AccessibilityActions: "Gh",
  credentialObservationGate: "TB",
  canObserve: "Je",
  disabledCapabilities: "wp",
  createLocalizer: "k3",
  clearWebMcpSessions: "_N",
};
async function run(original: boolean, mode: string, backend: string) {
  const trace: any[] = [];
  const clean = (value: any): any =>
    typeof value === "function"
      ? "<function>"
      : value?.fixtureName
        ? value.fixtureName
        : Array.isArray(value)
          ? value.map(clean)
          : value && typeof value === "object"
            ? Object.fromEntries(
                Object.entries(value)
                  .filter(([key]) => key !== "detachTurn")
                  .map(([key, value]) => [key, clean(value)]),
              )
            : value;
  const record = (name: string, ...args: any[]) =>
    trace.push([name, ...args.map(clean)]);
  const instances: Record<string, any> = {};
  const deps: any = {};
  for (const name of Object.keys(symbols).slice(0, 17))
    deps[name] = class {
      fixtureName = name;
      args: any[];
      handlers: Record<string, Function> = {};
      constructor(...args: any[]) {
        this.args = args;
        instances[name] = this;
        record("new " + name, ...args);
      }
      on(event: string, callback: Function) {
        record(name + ".on", event);
        this.handlers[event] = callback;
      }
      addTabAttachHandler(callback: Function) {
        record("attach handler");
        this.handlers.attach = callback;
        return () => record("remove attach");
      }
      getNetworkPolicy() {
        record("network policy");
        return { constraints: ["fixture"] };
      }
      recordAcquired(tab: any) {
        record("acquired", tab);
      }
      clearFrame(...args: any[]) {
        record("clearFrame", ...args);
      }
      capture(...args: any[]) {
        record("capture", ...args);
      }
      clear(...args: any[]) {
        record("clear", ...args);
      }
      peek(...args: any[]) {
        record("peek", ...args);
        return "instruction";
      }
      get(tab: any) {
        record("get tab", tab);
        return { id: tab };
      }
      createAuthorityBuilder(input: any) {
        record("authority", input);
        return "builder";
      }
      async cleanupPageClipboards() {
        record("clipboard cleanup");
        if (mode === "cleanup-error") throw Error("cleanup");
      }
      async detachAllTabs(reason?: string) {
        record("detach tabs", reason);
        if (mode === "detach-error") throw Error("detach");
      }
      async dispose() {
        record(name + ".dispose");
        if (name === "Clipboard" && mode === "dispose-error")
          throw Error("dispose");
      }
    };
  // The original AX disposal is synchronous; keep its fixture synchronous too.
  deps.Accessibility.prototype.dispose = function () {
    record("Accessibility.dispose");
  };
  deps.credentialObservationGate = (...args: any[]) => {
    record("gate", ...args);
    return {
      bindNavigationEvents: (cdp: any) => {
        record("bind navigation", cdp);
        return () => record("remove navigation");
      },
    };
  };
  let observable = true;
  deps.canObserve = () => {
    record("can observe");
    return observable;
  };
  deps.disabledCapabilities = () => {
    record("disabled capabilities");
    return new Set(mode === "disabled" ? ["Tab.ax"] : []);
  };
  deps.createLocalizer = (locale: any) => {
    record("localizer", locale);
    return (...args: any[]) => [locale, ...args];
  };
  deps.clearWebMcpSessions = (context: any) =>
    record("clear sessions", context.browserId);
  let closeCallback: any;
  const api: any = {
    fixtureName: "api",
    addCloseListener(callback: any) {
      record("close listener");
      closeCallback = callback;
      return () => record("remove close");
    },
    async close() {
      record("api close");
    },
    async getCommittedTabUrl(tab: any) {
      record("url", tab);
      return "https://fixture.invalid";
    },
    getCurrentSessionId() {
      record("session");
      return "session";
    },
    async getUserHistory(input: any) {
      record("history", input);
      return ["history"];
    },
    sendWebMcpToolInvoked(input: any) {
      record("tool invoked", input);
      return "discarded";
    },
    async nameSession(name: any) {
      record("name", name);
      return "discarded";
    },
    async followSessionTab(...args: any[]) {
      record("follow", ...args);
      return true;
    },
    async getInfo() {
      record("info");
      if (mode === "info-error") throw Error("info");
      return { capabilities: { tab: [{ id: "browserAuth" }] } };
    },
    async executeUnhandledCommand(command: any) {
      record("unhandled", command);
      return "executed";
    },
  };
  const runtime: any = {
    fixtureName: "runtime",
    platform: "darwin",
    env: { HTTP_PROXY: mode === "proxy" ? "synthetic" : undefined },
    gaas: mode === "proxy" ? {} : undefined,
  };
  const options: any = {
    runtime,
    commandTiming: "timing",
    filesystem: "filesystem",
    environment: mode === "cloud" ? "cloud" : "orbit",
    performanceSpan: "span",
    config: "config",
    elicitationDisplayName: "Fixture",
    preferredWindowId: 3,
  };
  const external = Object.fromEntries(
    Object.entries(symbols).map(([key, symbol]) => [symbol, deps[key]]),
  );
  const Context = original
    ? originalServiceBindings(["ob"], external).ob
    : createBrowserContextClass(deps);
  const context = new Context(
    api,
    "browser",
    {
      type: backend,
      family: "chromium",
      apiSupportOverrides: { "Tab.ax": true },
      executionPolicy: "policy",
    },
    options,
  );
  record("network result", await instances.Cdp.args[3]());
  instances.Cdp.handlers.attach?.(9);
  instances.Cdp.handlers.event({
    method: "Page.frameStartedLoading",
    source: { tabId: 9 },
    params: { frameId: "frame" },
  });
  instances.Cdp.handlers.event({
    method: "Page.frameStartedLoading",
    source: { tabId: "9" },
    params: { frameId: "ignored" },
  });
  instances.Cdp.handlers.event({
    method: "other",
    source: { tabId: 9 },
    params: { frameId: "ignored" },
  });
  instances.DocumentResponses.handlers.response(9, { url: "synthetic" });
  instances.DocumentResponses.handlers.tabDetached(9);
  const axOptions = instances.Accessibility.args[3];
  record("ax session", instances.Accessibility.args[1]());
  record("ax tab", axOptions.getTab(9));
  record("instruction", axOptions.getSiteInstruction(9, "frame"));
  observable = false;
  record("hidden instruction", axOptions.getSiteInstruction(9, "frame"));
  record("security url", await instances.Security.args[0].get(9));
  const first = context.localize;
  record("locale cache", first === context.localize);
  runtime.requestMeta = { "openai/locale": "zh-CN" };
  record("localized", instances.Security.args[5]("key", { value: 1 }));
  runtime.requestMeta = { "openai/locale": 3 };
  record("default locale", context.localize("key"));
  record("authority result", context.acquireAuthority("input"));
  record("history result", await context.history("input"));
  record("tool result", context.sendWebMcpToolInvoked("tool"));
  record("name result", await context.nameSession("name"));
  record("follow result", await context.followSessionTab(9));
  record("follow reason", await context.followSessionTab(9, "explicit"));
  record("supports", await context.supportsTabCapability("browserAuth"));
  record("unsupported", await context.supportsTabCapability("missing"));
  record("unhandled result", await context.executeUnhandledCommand("command"));
  try {
    await api.detachTurn(() => {
      record("predicate", false);
      return false;
    });
    await api.detachTurn(() => {
      record("predicate", true);
      return true;
    });
  } catch (error: any) {
    record("turn error", error.message);
  }
  try {
    if (mode === "closed") await closeCallback();
    else await Promise.all([context.dispose(), context.dispose()]);
  } catch (error: any) {
    record("dispose error", error.message);
  }
  try {
    await context.dispose();
  } catch (error: any) {
    record("repeat error", error.message);
  }
  record("final", context.transportClosed, api.detachTurn === undefined);
  return trace;
}
test("browser context preserves original constructor wiring, events, delegates and lifecycle", async () => {
  for (const backend of ["iab", "extension", "cdp"])
    for (const mode of [
      "normal",
      "disabled",
      "proxy",
      "cloud",
      "info-error",
      "closed",
      "cleanup-error",
      "dispose-error",
      "detach-error",
    ]) {
      const expected = await run(true, mode, backend),
        actual = await run(false, mode, backend);
      assert.deepEqual(actual, expected, `${backend}/${mode}`);
      assert.equal(
        actual.filter((row) => row[0] === "Clipboard.dispose").length,
        1,
      );
      if (mode === "closed")
        assert.equal(
          actual.some((row) => row[0] === "api close"),
          false,
        );
      if (mode === "dispose-error")
        assert.equal(
          actual.some((row) => row[0] === "Accessibility.dispose"),
          false,
        );
      if (mode === "cleanup-error")
        assert.equal(
          actual.some((row) => row[0] === "predicate"),
          false,
        );
    }
});

test("assembled context connects restored services and adapts Playwright constructor order", async () => {
  const { assembleBrowserContext, canObserveBrowserContext } =
    await import("../packages/browser/src/service/context/browser_context_assembly");
  const { PlaywrightService } =
    await import("../packages/browser/src/service/playwright/service");
  const { BrowserInput } =
    await import("../packages/browser/src/service/input/index");
  const { BrowserSecurity } =
    await import("../packages/browser/src/service/security/browser_security");
  const { credentialObservationState } =
    await import("../packages/browser/src/service/security/credential_observation");
  const events: string[] = [];
  let closed = 0;
  const api: any = {
    addEventListener(name: string, _listener: any) {
      events.push(name);
    },
    addCloseListener() {
      return () => events.push("removeClose");
    },
    async close() {
      closed++;
    },
    getCurrentSessionId() {
      return "assembly-session";
    },
    getCurrentTurnId() {
      return "assembly-turn";
    },
    async getCommittedTabUrl() {
      return "https://fixture.invalid";
    },
    async getInfo() {
      return { capabilities: { tab: [{ id: "browserAuth" }] } };
    },
  };
  const Context = assembleBrowserContext({
    injectedSource: "/* synthetic unused injection */",
    reportError() {},
    reportEvent() {},
    createLocalizer: (locale) => (key: string) => `${locale}:${key}`,
  });
  const timing: any = { marker: "timing" },
    span: any = { marker: "span" },
    policy = { documentOnly: true };
  const context = new Context(
    api,
    "context-assembly-fixture",
    { type: "cdp", family: "chromium", executionPolicy: policy },
    {
      runtime: {
        platform: "darwin",
        env: {},
        requestMeta: { "openai/locale": "zh-CN" },
      },
      commandTiming: timing,
      performanceSpan: span,
      filesystem: {},
      config: {},
      environment: "orbit",
      elicitationDisplayName: "Fixture",
    },
  );
  assert.ok(context.playwright instanceof PlaywrightService);
  assert.ok(context.cua instanceof BrowserInput);
  assert.ok(context.security instanceof BrowserSecurity);
  assert.equal(context.playwright.cdp, context.cdp);
  assert.equal(context.playwright.cua, context.cua);
  assert.equal(context.playwright.commandTiming, timing);
  assert.equal(context.playwright.performanceSpan, span);
  assert.equal(context.playwright.executionPolicy, policy);
  assert.equal(context.security.preferences, context.preferences);
  assert.equal(context.ax.actions.context, context);
  assert.equal(context.documentResponses.cdp, context.cdp);
  assert.equal(
    await context.security.currentTabUrl(1),
    "https://fixture.invalid",
  );
  assert.equal(context.localize("key"), "zh-CN:key");
  assert.equal(await context.supportsTabCapability("browserAuth"), true);
  assert.deepEqual(await context.cdp.readNetworkPolicy(), { constraints: [] });
  assert.ok(events.includes("onCDPEvent"));
  assert.equal(canObserveBrowserContext(context), true);
  const gate = credentialObservationState.getGate(
    "other-context-fixture",
    context.cdp,
  );
  const previous = gate.restriction;
  gate.restriction = "private";
  try {
    assert.equal(canObserveBrowserContext(context), false);
  } finally {
    gate.restriction = previous;
  }
  await api.detachTurn(() => false);
  await Promise.all([context.dispose(), context.dispose()]);
  assert.equal(closed, 1);
  assert.equal(api.detachTurn, undefined);
});

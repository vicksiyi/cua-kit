import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createBrowserCommandHandlerClass } from "../packages/browser-extension/src/command_handler";

function fixture(original: boolean, options: any = {}) {
  const trace: any[] = [];
  const state = {
    observed: true,
    applied: true,
    animate: true,
    active: true,
    incognito: false,
    childLease: true,
    claimError: false,
    activeLease: true,
  };
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const record =
    (name: string, result?: any) =>
    (...args: any[]) => {
      trace.push([name, ...args]);
      return result;
    };
  class Session {
    currentTurnId: string | null = null;
    constructor(...args: any[]) {
      trace.push([
        "Session",
        args[0],
        args[1],
        args[2],
        args[3].constructor.name,
      ]);
    }
    async activateTurn(request: any) {
      trace.push(["activateTurn", request]);
      this.currentTurnId = request.turn_id;
    }
    requireActiveTurn(turn: string) {
      trace.push(["requireActiveTurn", turn]);
      if (this.currentTurnId !== turn) throw Error("inactive turn");
    }
    async runPassiveRead(request: any, operation: () => any) {
      trace.push(["passive", request]);
      return operation();
    }
    async getTabs() {
      trace.push(["getTabs"]);
      return [{ id: 3, title: "tab" }];
    }
    async claimChildTab(...args: any[]) {
      trace.push(["claimChildTab", ...args]);
      if (state.claimError) throw Error("claim failed");
    }
  }
  for (const name of [
    "executeCdp",
    "attach",
    "attachTarget",
    "detach",
    "detachTarget",
    "attachBrowserUseNetworkPolicy",
    "detachBrowserUseNetworkPolicy",
    "getCommittedTabUrl",
    "claimUserTab",
    "createTab",
    "markTab",
    "finalizeTabs",
    "nameSession",
    "executeBrowserManagementCall",
    "getBrowserManagementAuditTrail",
    "setViewport",
    "requireSessionTab",
    "endTurn",
  ]) {
    (Session.prototype as any)[name] = async (...args: any[]) => {
      trace.push([name, ...args]);
      return `${name}:result`;
    };
  }
  class RequestHeaderPolicy {
    async isEnabled() {
      trace.push(["headers.enabled"]);
      return true;
    }
  }
  class Siwc {
    constructor(_activate: any) {}
    getSiwcAccountContext = record("siwc.context", "context");
    issueSiwcBrowserGrant = record("siwc.issue", "grant");
    installSiwcBrowserGrantCookie = record("siwc.install", "cookie");
  }
  const provider = {
    getProviderTabId: record("provider.id", "provider:3"),
    getUserTabs: record("provider.tabs", [{ id: 5 }]),
    getCapabilityInfo: record("provider.info", { supported: true }),
  };
  class TabMentionProvider {
    constructor(channel: any, favicons: any) {
      trace.push(["provider.new", channel, favicons]);
      Object.assign(this, provider);
    }
  }
  const singleton = (name: string, value: any) => ({
    getInstance: record(name, value),
  });
  const chrome = {
    tabs: {
      update: record("tabs.update", {}),
      query: async (...args: any[]) => {
        trace.push(["tabs.query", ...args]);
        return [{ id: 3, incognito: state.incognito }];
      },
      get: async (...args: any[]) => {
        trace.push(["tabs.get", ...args]);
        return { id: 3, incognito: state.incognito };
      },
      create: async (...args: any[]) => {
        trace.push(["tabs.create", ...args]);
        return { id: 7 };
      },
      remove: async (...args: any[]) => {
        trace.push(["tabs.remove", ...args]);
      },
    },
    windows: { update: record("windows.update", {}) },
    scripting: {
      executeScript: async ({ func, ...args }: any) => {
        trace.push(["executeScript", args, func()]);
        return [{ result: { text: "context" } }];
      },
    },
    runtime: {
      getURL: record("getURL", "extension:icon"),
      getVersion: () => "test",
      id: "extension",
    },
    bookmarks: { getTree: record("bookmarks", []) },
    notifications: { create: record("notification", "notification:1") },
    sessions: { getRecentlyClosed: record("recent", []) },
    topSites: { get: record("topSites", []) },
  };
  const schemas = Object.fromEntries(
    [
      "managementInput",
      "managementOutput",
      "auditInput",
      "auditOutput",
      "viewportInput",
      "viewportOutput",
      "resetInput",
      "resetOutput",
    ].map((name) => [name, { parse: record(`schema.${name}`, undefined) }]),
  );
  for (const [name, schema] of Object.entries(schemas))
    schema.parse = (input: any) => {
      trace.push([`schema.${name}`, input]);
      return input;
    };
  const deps: any = {
    chrome,
    navigator: { userAgent: "test", brave: undefined },
    browserFamily: record("family", "chrome"),
    tabLeases: singleton("leases", {
      getActiveLease: async (id: number) => {
        trace.push(["lease", id]);
        return !state.activeLease || (id === 7 && !state.childLease)
          ? null
          : { sessionId: "s", turnId: "t" };
      },
    }),
    RequestHeaderPolicy,
    Siwc,
    buildChannel: record("channel", "prod"),
    favicons: singleton("favicons", "favicons"),
    TabMentionProvider,
    initializeDebugger: record("init.debugger"),
    initializeForeignExtensionFrameMonitor: record(
      "init.foreignExtensionFrameMonitor",
    ),
    initializePopupInterceptor: record("init.popupInterceptor"),
    networkPolicy: singleton("network", {}),
    getTab: async (id: number) => {
      trace.push(["getTab", id]);
      return { id, windowId: 9 };
    },
    validateCdp: (method: string, params: any) => {
      trace.push(["validateCdp", method, params]);
      if (method === "forbidden") throw Error("forbidden");
    },
    filterCdp: record("filterCdp", "filtered"),
    getUserTabs: record("userTabs", [{ id: 3 }]),
    getUserHistory: record("history", []),
    validateTabId: (method: string, id: any) => {
      trace.push(["validateTabId", method, id]);
      if (!Number.isInteger(id))
        throw Error(`${method} requires an integer tabId`);
    },
    executeTabRead: record("read", "read:result"),
    getTabContext: async (execute: any) => {
      trace.push(["context"]);
      return execute(() => "script", [1], "MAIN");
    },
    browserInfo: { chrome: { shortDisplayName: "Chrome" } },
    dispatchCommand: async ({
      backendName,
      commandSets,
      handlers,
      payload,
    }: any) => {
      trace.push([
        "dispatch",
        backendName,
        commandSets,
        Object.keys(handlers),
        payload,
      ]);
      return handlers[payload.command](payload.input);
    },
    commandSets: ["set1", "set2"],
    commandNames: {
      management: "management",
      audit: "audit",
      setViewport: "setViewport",
      resetViewport: "resetViewport",
    },
    schemas,
    validateMouse: record("validateMouse"),
    overlay: {
      isObserved: (id: number) => {
        trace.push(["observed", id]);
        return state.observed;
      },
      isBrowserControlActive: () => state.active,
      setCursorState: async (...args: any[]) => {
        trace.push(["cursor", ...args]);
        return state.applied;
      },
    },
    canAnimateCursor: async (id: number) => {
      trace.push(["animate", id]);
      return state.animate;
    },
    Session,
    instanceId: record("instance", "instance:1"),
    capabilities: {
      browser: "browser",
      management: "management",
      pageAssets: "pageAssets",
      tab: "tab",
      webMcp: "webMcp",
    },
    setTimeout: (fn: () => void, ms: number) => {
      trace.push(["timer", ms]);
      timers.set(++timerId, fn);
      return timerId;
    },
    clearTimeout: (id: number) => {
      trace.push(["clearTimer", id]);
      timers.delete(id);
    },
  };
  const external = {
    chrome,
    navigator: deps.navigator,
    Jt: deps.browserFamily,
    st: deps.tabLeases,
    uS: RequestHeaderPolicy,
    py: Siwc,
    Rr: deps.buildChannel,
    Ma: deps.favicons,
    Xu: TabMentionProvider,
    fE: deps.initializeDebugger,
    qy: deps.initializeForeignExtensionFrameMonitor,
    Cy: deps.initializePopupInterceptor,
    ar: deps.networkPolicy,
    yt: deps.getTab,
    Qp: deps.validateCdp,
    Xp: deps.filterCdp,
    wE: deps.getUserTabs,
    yE: deps.getUserHistory,
    Xr: deps.validateTabId,
    my: deps.executeTabRead,
    dg: deps.getTabContext,
    Ue: deps.browserInfo,
    Np: deps.dispatchCommand,
    oy: "set1",
    Yw: "set2",
    ai: "management",
    oi: "audit",
    li: "setViewport",
    ci: "resetViewport",
    Gr: schemas.managementInput,
    pa: schemas.managementOutput,
    ma: schemas.auditInput,
    ga: schemas.auditOutput,
    ya: schemas.viewportInput,
    Sa: schemas.viewportOutput,
    ba: schemas.resetInput,
    wa: schemas.resetOutput,
    RE: deps.validateMouse,
    Ie: deps.overlay,
    OE: deps.canAnimateCursor,
    wd: Session,
    Be: deps.instanceId,
    Ou: { info: "browser" },
    bu: { info: "management" },
    cE: "pageAssets",
    fu: { info: "tab" },
    hu: "webMcp",
    lE: 1500,
    setTimeout: deps.setTimeout,
    clearTimeout: deps.clearTimeout,
  };
  const Handler = original
    ? extensionBindings(["pE", "bd", "Od", "PE", "xE"], external).pE
    : createBrowserCommandHandlerClass(deps);
  const handler = new Handler(options);
  return { handler, trace, state, timers, deps };
}
const request = { session_id: "s", turn_id: "t", tabId: 3 };
async function outcome(run: () => any) {
  try {
    return { value: await run() };
  } catch (error: any) {
    return { error: error.message };
  }
}
async function compare(
  run: (f: ReturnType<typeof fixture>) => Promise<any>,
  options?: any,
) {
  const a = fixture(true, options),
    b = fixture(false, options);
  assert.deepEqual(await run(b), await run(a));
  assert.deepEqual(b.trace, a.trace);
  assert.deepEqual(Object.keys(b.handler), Object.keys(a.handler));
}

test("extension command handler preserves every original method and session/CDP dispatch ordering", async () => {
  const a = fixture(true),
    b = fixture(false);
  assert.deepEqual(
    Object.getOwnPropertyNames(Object.getPrototypeOf(b.handler)),
    Object.getOwnPropertyNames(Object.getPrototypeOf(a.handler)),
  );
  await compare(async ({ handler: h }) => {
    const results: any[] = [h.ping()];
    for (const input of [
      {},
      { session_id: 1, turn_id: "t" },
      { session_id: "s" },
      { ...request, session_context: "cached" },
    ])
      results.push(await outcome(() => h.resolveSession(input)));
    results.push(
      await outcome(() => h.executeCdp({ ...request, method: "forbidden" })),
    );
    results.push(
      await h.executeCdp({
        ...request,
        method: "Runtime.evaluate",
        commandParams: { expression: "1" },
      }),
    );
    results.push(
      Boolean(h.resolveSession({ ...request, session_context: "cached" })),
    );
    results.push(
      await outcome(() =>
        h.resolveSession({
          ...request,
          turn_id: "other",
          session_context: "cached",
        }),
      ),
    );
    for (const method of [
      "attach",
      "attachTarget",
      "detach",
      "detachTarget",
      "attachBrowserUseNetworkPolicy",
      "detachBrowserUseNetworkPolicy",
      "getCommittedTabUrl",
      "getSiwcAccountContext",
      "issueSiwcBrowserGrant",
      "installSiwcBrowserGrantCookie",
      "getTabs",
      "getUserHistory",
      "getBookmarks",
      "createNotification",
      "getRecentlyClosedSessions",
      "getTopSites",
      "claimUserTab",
      "markTab",
      "nameSession",
      "turnEnded",
    ])
      results.push(
        await h[method]({
          ...request,
          policy: {},
          title: "title",
          message: "body",
          status: "handoff",
          name: "name",
        }),
      );
    for (const preferredWindowId of [undefined, -1, 0, 2, 1.5, "1", NaN])
      results.push(await h.createTab({ ...request, preferredWindowId }));
    results.push(
      await outcome(() => h.finalizeTabs(request)),
      await h.finalizeTabs({ ...request, keep: [3] }),
    );
    results.push(await h.turnEnded({ session_id: "new", turn_id: "ended" }));
    return results;
  });
});

test("extension command handler preserves passive reads, focus, tab metadata and capability gates", async () => {
  await compare(async ({ handler: h, state, deps }) => {
    const results: any[] = [];
    for (const tabId of [0, -1, 1.1, "3"])
      results.push(await outcome(() => h.focusTab({ tabId })));
    results.push(await h.focusTab(request), await h.focusTab({ tabId: 3 }));
    await h.activateSession(request);
    results.push(await h.focusTab(request));
    for (const params of [
      {},
      { query: "" },
      { limit: 0 },
      { includeFavicons: false },
    ])
      results.push(await h.getUserTabs(params));
    results.push(
      await h.executeTabRead(request),
      await outcome(() => h.executeTabRead({ ...request, tabId: "3" })),
    );
    results.push(
      await h.getTabContext(request),
      await h.getTabContext({ session_id: "s", turn_id: "t" }),
    );
    state.incognito = true;
    results.push(await outcome(() => h.getTabContext(request)));
    results.push(await h.getInfo({}));
    delete deps.chrome.runtime.getVersion;
    h.browserManagementEnabled = Promise.resolve(false);
    h.webMcpConfig = { enabled: async () => true };
    results.push(await h.getInfo({}));
    for (const command of [
      "management",
      "audit",
      "setViewport",
      "resetViewport",
    ])
      results.push(
        await outcome(() =>
          h.executeUnhandledCommand({
            ...request,
            command,
            input: { height: 600, width: 800 },
          }),
        ),
      );
    h.browserManagementEnabled = Promise.resolve(true);
    for (const command of ["management", "audit"])
      results.push(
        await h.executeUnhandledCommand({
          ...request,
          command,
          input: { action: "list" },
        }),
      );
    return results;
  });
});

test("extension command handler preserves cursor arrival, cancellation and timeout cleanup", async () => {
  await compare(async ({ handler: h, state, timers }) => {
    const results: any[] = [];
    for (const observed of [false, true]) {
      state.observed = observed;
      for (const waitForArrival of [false, true]) {
        const running = h.moveMouse({
          ...request,
          x: 10,
          y: 20,
          waitForArrival,
        });
        for (let i = 0; i < 10; i++) await Promise.resolve();
        h.notifyCursorArrived({
          sessionId: "s",
          turnId: "t",
          moveSequence: h.nextCursorMoveSequence - 1,
        });
        await running;
        results.push([timers.size, h.cursorArrivalWaitersByKey.size]);
      }
    }
    state.applied = false;
    await h.moveMouse({ ...request, x: 1, y: 2 });
    results.push(timers.size);
    state.applied = true;
    const running = h.moveMouse({ ...request, x: 3, y: 4 });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    h.notifyCursorArrived({ sessionId: "s", turnId: "t", moveSequence: 1.5 });
    for (const timer of [...timers.values()]) timer();
    await running;
    results.push([timers.size, h.cursorArrivalWaitersByKey.size]);
    return results;
  });
});

test("extension command handler preserves download events and child popup ownership cleanup", async () => {
  await compare(async ({ handler: h, state }) => {
    const events: any[] = [],
      remove = h.addDownloadChangeListener((event: any) => events.push(event));
    for (const id of [-1, "1", 1.5, 0, 2])
      h.handleDownloadCreated({
        id,
        filename: "file",
        finalUrl: "https://example.test/file",
      });
    state.active = false;
    h.handleDownloadCreated({ id: 5, filename: "ignored" });
    state.active = true;
    for (const status of [
      undefined,
      "in_progress",
      "complete",
      "interrupted",
      "unknown",
    ])
      for (const error of [undefined, "USER_CANCELED"])
        h.handleDownloadChanged({
          id: 2,
          filename: { current: "renamed" },
          state: { current: status },
          error: { current: error },
        });
    h.handleDownloadChanged({ id: 99, state: { current: "complete" } });
    remove();
    h.handleDownloadChanged({ id: 2, state: { current: "complete" } });
    await h.handleCreatedNavigationTarget({ sourceTabId: 3, tabId: 7 });
    await h.activateSession(request);
    await h.handleCreatedNavigationTarget({ sourceTabId: 3, tabId: 7 });
    for (const url of [
      "invalid",
      "file:///tmp/test",
      "https://example.test/path",
    ])
      await h.handleAgentBackgroundPopup(3, url);
    state.childLease = false;
    await h.handleAgentBackgroundPopup(3, "https://example.test");
    state.claimError = true;
    const failed = await outcome(() =>
      h.handleAgentBackgroundPopup(3, "https://example.test"),
    );
    state.activeLease = false;
    await h.handleAgentBackgroundPopup(3, "https://example.test");
    return { events, failed };
  });
});

test("extension RPC facade routes browser commands into restored handler and serializes validation failures", async () => {
  const { ExtensionBrowserPeer } =
    await import("../packages/browser-extension/src/browser_peer");
  const { handler, trace } = fixture(false);
  const sent: any[] = [];
  const peer = new ExtensionBrowserPeer(
    { setMessageCallback() {}, sendMessage: (message) => sent.push(message) },
    handler,
  );
  await peer.handleIncomingMessage({ id: 1, method: "ping" });
  await peer.handleIncomingMessage({
    id: 2,
    method: "getTabs",
    params: request,
  });
  await peer.handleIncomingMessage({
    id: 3,
    method: "focusTab",
    params: { tabId: -1 },
  });
  await peer.handleIncomingMessage({
    id: 4,
    method: "turnEnded",
    params: request,
  });
  assert.deepEqual(sent, [
    { jsonrpc: "2.0", id: 1, result: "pong" },
    {
      jsonrpc: "2.0",
      id: 2,
      result: [{ id: 3, title: "tab", providerTabId: "provider:3" }],
    },
    {
      jsonrpc: "2.0",
      id: 3,
      error: { code: 1, message: "focusTab requires a positive integer tabId" },
    },
    { jsonrpc: "2.0", id: 4, result: undefined },
  ]);
  assert.ok(trace.some((entry) => entry[0] === "endTurn" && entry[1] === "t"));
});

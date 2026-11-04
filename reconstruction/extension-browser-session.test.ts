import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createBrowserSessionClass } from "../packages/browser-extension/src/browser_session";
const request = { session_id: "s", turn_id: "t" };
const snapshot = (value: any): any =>
  value instanceof Map
    ? [...value].map(snapshot)
    : value instanceof Set
      ? [...value].map(snapshot)
      : Array.isArray(value)
        ? value.map(snapshot)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value).map(([key, entry]) => [
                key,
                snapshot(entry),
              ]),
            )
          : typeof value === "function"
            ? "callback"
            : value;
const outcome = async (run: () => any) => {
  try {
    return { value: snapshot(await run()) };
  } catch (error: any) {
    return { error: error.message };
  }
};
function fixture(original: boolean) {
  const trace: any[] = [],
    tabs = new Map<number, any>(
      [1, 2, 3, 4].map((id) => [
        id,
        { id, active: id === 1, url: "https://example.test", windowId: 9 },
      ]),
    );
  const leases = new Map<number, any>(),
    handoffs = new Map<number, any>();
  const state = {
    owned: true,
    popup: true,
    attachFail: false,
    timeout: false,
    detachFail: false,
    owner: null as string | null,
    child: true,
  };
  const call =
    (name: string, fn: (...args: any[]) => any = () => undefined) =>
    async (...args: any[]) => {
      trace.push([name, ...snapshot(args)]);
      return await fn(...args);
    };
  const tabLeases = {
    getSessionActiveLeases: call("leases.active", () => leases),
    getSessionHandoffLeases: call("leases.handoff", () => handoffs),
    getSessionTabs: call("leases.tabs", () => [...tabs.values()]),
    isClaimedBySession: call("leases.owned", () => state.owned),
    getOwningSessionId: call("leases.owner", () => state.owner),
    setSessionRequestHeaders: call("leases.headers"),
    setSessionRequestHeaderEnabled: call("leases.enabled"),
    updateActiveSessionTurn: call("leases.turn"),
    takeViewportSizeForAttach: call("leases.takeViewport", () => ({
      width: 800,
      height: 600,
    })),
    claimTab: call("leases.claim"),
    claimTabIfSourceLeaseMatches: call("leases.child", () => state.child),
    setTabMark: call("leases.mark"),
    setViewportSize: call("leases.viewport"),
    replaceTurnMarks: call("leases.marks"),
    clearPendingViewportSize: call("leases.clearViewport"),
    releaseTabs: call("leases.release"),
    handoffTabs: call("leases.giveHandoff"),
    reconcileRequestHeaders: call("leases.reconcile"),
    resumeHandoffTabs: call("leases.resume", (_session, _turn, ids) => ids),
  };
  const tabGroups = Object.fromEntries(
    [
      "ensureAgentTabGroup",
      "setSessionGroupTitle",
      "releaseTabsFromManagedGroups",
      "refreshManagedGroupsFromChrome",
    ].map((name) => [name, call(`groups.${name}`)]),
  );
  const tabFavicons = {
    restoreTabFaviconsBestEffort: call("favicons.restore"),
    markFinalized: call("favicons.mark"),
    closeTabsWithFaviconRestore: call("favicons.close", async (_ids, close) =>
      close(),
    ),
  };
  const singleton = (name: string, value: any) => ({
    getInstance() {
      trace.push([name]);
      return value;
    },
  });
  const getTab = call("getTab", (id) => {
    if (!tabs.has(id)) throw Error("missing tab");
    return tabs.get(id);
  });
  const deps: any = {
    chrome: {
      tabs: {
        get: call("chrome.tabs.get", (id) => tabs.get(id)),
        remove: call("chrome.tabs.remove"),
      },
    },
    tabGroups: singleton("groups", tabGroups),
    tabLeases: singleton("leases", tabLeases),
    tabFavicons: singleton("favicons", tabFavicons),
    networkPolicy: singleton("network", {
      attach: call("network.attach"),
      detach: call("network.detach", () => {
        if (state.detachFail) throw Error("detach failed");
      }),
    }),
    attachedTabs: new Set([1]),
    targetOwners: new Map([["target:1", 1]]),
    overlay: Object.fromEntries(
      ["stopSessions", "untrackTab", "startSession", "trackTab"].map((name) => [
        name,
        call(`overlay.${name}`),
      ]),
    ),
    browserInfo: { chrome: { shortDisplayName: "Chrome" } },
    executeBrowserManagement: call("management", () => "managed"),
    getBrowserManagementAuditTrail: call("audit", () => ["entry"]),
    sendCdp: call("cdp", (params) => {
      if (state.timeout && params.method !== "Page.stopLoading")
        throw Error("timeout");
      return { ok: true };
    }),
    isCdpTimeout: (error: any) => error.message === "timeout",
    detachAfterTimeout: call("timeout.detach"),
    attachDebugger: call("debugger.attach", () => {
      if (state.attachFail) throw Error("attach failed");
    }),
    attachDebuggerTarget: call("debugger.attachTarget"),
    detachDebugger: call("debugger.detach"),
    detachDebuggerTarget: call("debugger.detachTarget"),
    runTabOperation: call("tabOperation", async (_tab, operation) =>
      operation(),
    ),
    getTab,
    createTab: call("createTab", () => tabs.get(4)),
    muteBackgroundTab: call("mute"),
    isNewTab: (_family: string, url: any) => url === "chrome://newtab/",
    isInternalTab: (_family: string, url: any) =>
      url?.startsWith("chrome://") ?? false,
    prepareNewTab: call("prepareNewTab", (id) => ({
      ...tabs.get(id),
      url: "about:blank",
    })),
    tabInfo: (tab: any) => ({ ...tab }),
    removeFrameMonitor: call("frame.remove"),
    removePopupInterceptor: call("popup.remove"),
    trackFrameMonitor: (id: number) => trace.push(["frame.track", id]),
    ensureFrameMonitor: call("frame.ensure"),
    trackPopupInterceptor: (id: number) => trace.push(["popup.track", id]),
    ensurePopupInterceptor: call("popup.ensure", () => state.popup),
    warn: (message: string) => trace.push(["warn", message]),
    metric: (...args: any[]) => trace.push(["metric", ...args]),
  };
  const external = {
    chrome: deps.chrome,
    bS: deps.tabGroups,
    st: deps.tabLeases,
    Ma: deps.tabFavicons,
    ar: deps.networkPolicy,
    wt: deps.attachedTabs,
    _i: deps.targetOwners,
    Ie: deps.overlay,
    Ue: deps.browserInfo,
    KS: deps.executeBrowserManagement,
    NS: deps.getBrowserManagementAuditTrail,
    Pd: deps.sendCdp,
    Md: deps.isCdpTimeout,
    _E: deps.detachAfterTimeout,
    yd: deps.attachDebugger,
    mE: deps.attachDebuggerTarget,
    Ed: deps.detachDebugger,
    Td: deps.detachDebuggerTarget,
    yi: deps.runTabOperation,
    yt: deps.getTab,
    vE: deps.createTab,
    Vu: deps.muteBackgroundTab,
    dc: deps.isNewTab,
    Cn: deps.isInternalTab,
    bE: deps.prepareNewTab,
    Jr: deps.tabInfo,
    zy: deps.removeFrameMonitor,
    Ry: deps.removePopupInterceptor,
    Gy: deps.trackFrameMonitor,
    ju: deps.ensureFrameMonitor,
    ky: deps.trackPopupInterceptor,
    $u: deps.ensurePopupInterceptor,
    console: { warn: deps.warn },
    Yt: deps.metric,
  };
  const Class = original
    ? extensionBindings(
        ["wd", "Xr", "ME", "LE", "tm", "DE", "hc", "Cp", "cs", "ls", "Sr"],
        external,
      ).wd
    : createBrowserSessionClass(deps);
  const policy = { applyDecision: call("policy", (enabled) => enabled) };
  const session = new Class("s", "chrome", false, policy);
  return { session, Class, trace, tabs, leases, handoffs, state, deps };
}
async function compare(
  run: (fixture: ReturnType<typeof fixture>) => Promise<any>,
) {
  const a = fixture(true),
    b = fixture(false);
  assert.deepEqual(
    Object.getOwnPropertyNames(a.Class.prototype),
    Object.getOwnPropertyNames(b.Class.prototype),
  );
  assert.deepEqual(await run(b), await run(a));
  assert.deepEqual(b.trace, a.trace);
  assert.deepEqual(Object.keys(b.session), Object.keys(a.session));
  for (const key of [
    "activeTabId",
    "currentTurnId",
    "endedTurnIds",
    "requestHeaderEnabled",
    "requestHeaders",
  ])
    assert.deepEqual(b.session[key], a.session[key]);
}
test("extension session activation preserves headers, cached context, handoff recovery and passive-read lifecycle", async () => {
  await compare(async ({ session: s, leases, handoffs, tabs }) => {
    const results = [];
    results.push(
      await outcome(() =>
        s.runPassiveRead(
          { ...request, session_context: "cached" },
          async () => 1,
        ),
      ),
    );
    handoffs.set(2, { tabId: 2, isActiveHandoff: true });
    handoffs.set(99, { tabId: 99 });
    for (const input of [
      request,
      request,
      {
        ...request,
        request_headers: [{ name: "X-Session", value: "{{session_id}}" }],
      },
      { ...request, agent_request_header_enabled: "invalid" },
      {
        ...request,
        request_headers: null,
        agent_request_header_enabled: "invalid",
      },
      { ...request, request_headers: null },
      { ...request, agent_request_header_enabled: true },
      { ...request, request_headers: [{ name: "cookie", value: "bad" }] },
      { ...request, session_context: "cached", turn_id: "other" },
    ])
      results.push(await outcome(() => s.activateTurn(input)));
    leases.set(1, {
      tabId: 1,
      requestHeaders: [{ name: "x", value: "inherit" }],
    });
    results.push(
      await outcome(() => s.activateTurn({ ...request, turn_id: "next" })),
      await s.runPassiveRead(
        { turn_id: "next", session_context: "cached" },
        async () => "read",
      ),
    );
    await s.endTurn("past");
    results.push(
      await outcome(() =>
        s.runPassiveRead({ turn_id: "past" }, async () => "blocked"),
      ),
    );
    results.push(
      await outcome(() => s.executeBrowserManagementCall("wrong", {})),
      await s.executeBrowserManagementCall("next", { action: "list" }),
      await s.getBrowserManagementAuditTrail("next"),
    );
    return results;
  });
});
test("extension session tab creation, user/child claiming and viewport/marks retain original ordering", async () => {
  await compare(async ({ session: s, leases, tabs, state }) => {
    const results = [];
    s.activeTabId = 1;
    results.push(await s.createTab(request));
    leases.set(1, { tabId: 1, origin: "agent" });
    results.push(await s.createTab(request, 42));
    state.owner = "other";
    results.push(await outcome(() => s.claimUserTab(request, 2)));
    state.owner = "s";
    results.push(await s.claimUserTab(request, 2));
    state.owner = null;
    tabs.get(3).url = "chrome://newtab/";
    results.push(await s.claimUserTab(request, 3));
    tabs.get(3).url = "chrome://settings";
    results.push(await outcome(() => s.claimUserTab(request, 3)));
    await s.claimChildTab({ turnId: "wrong" }, 4);
    state.child = false;
    await s.claimChildTab({ turnId: "t" }, 4);
    state.child = true;
    await s.claimChildTab({ turnId: "t" }, 4, { logicalActive: true });
    for (const [id, status] of [
      [1.5, "handoff"],
      [1, "bad"],
      [1, "handoff"],
    ])
      results.push(await outcome(() => s.markTab(request, id, status)));
    await s.nameSession(request, "Test");
    await s.setViewport(request, { width: 100, height: 200 });
    results.push(await s.getTabs());
    s.activeTabId = 99;
    results.push(
      s.tabInfosWithLogicalActive([
        { id: 1, active: false },
        { id: 2, active: true },
      ]),
    );
    results.push(s.resolveLogicalActiveTabId([]));
    return results;
  });
});
test("extension session debugger/ownership failures preserve cleanup and timeout handling", async () => {
  await compare(async ({ session: s, state, deps, tabs }) => {
    const results = [];
    await s.activateTurn(request);
    results.push(
      await s.executeCdp({ target: { tabId: 1 }, method: "Page.close" }),
    );
    results.push(
      await outcome(() =>
        s.executeCdp({ target: { tabId: 2 }, method: "Runtime.evaluate" }),
      ),
    );
    state.timeout = true;
    for (const preserveDebuggerOnTimeout of [false, true])
      results.push(
        await outcome(() =>
          s.executeCdp({
            target: { tabId: 1 },
            method: "Page.navigate",
            preserveDebuggerOnTimeout,
          }),
        ),
      );
    state.timeout = false;
    state.attachFail = true;
    results.push(await outcome(() => s.attach({ ...request, tabId: 1 })));
    state.attachFail = false;
    await s.attach({ ...request, tabId: 1 });
    await s.attachTarget({ ...request, tabId: 1, targetId: "child" });
    results.push(await outcome(() => s.attachBrowserUseNetworkPolicy(1, {})));
    await s.attachBrowserUseNetworkPolicy(2, {});
    await s.detachBrowserUseNetworkPolicy(2);
    state.detachFail = true;
    await s.detach({ ...request, tabId: 1 });
    await Promise.resolve();
    state.detachFail = false;
    await s.detachTarget({ ...request, tabId: 1, targetId: "child" });
    state.owned = false;
    results.push(await outcome(() => s.getCommittedTabUrl(1)));
    state.owned = true;
    results.push(await s.getCommittedTabUrl(1));
    s.requestHeaderEnabled = true;
    state.popup = false;
    results.push(
      await outcome(() => s.requireSessionTab(1, { trackOverlay: true })),
    );
    tabs.get(1).url = "about:blank";
    await s.requireSessionTab(1, { trackOverlay: true, publishOverlay: false });
    return results;
  });
});
test("extension session ending partitions marks, releases resources and resumes the queue after failure", async () => {
  await compare(async ({ session: s, leases, tabs, trace }) => {
    await s.activateTurn(request);
    leases.set(1, {
      tabId: 1,
      turnId: "t",
      mark: "handoff",
      requestHeaderEnabled: true,
    });
    leases.set(2, { tabId: 2, turnId: "t", mark: "deliverable" });
    leases.set(3, { tabId: 3, turnId: "t", origin: "agent" });
    leases.set(4, { tabId: 4, turnId: "t", origin: "user" });
    const results = [];
    for (const keep of [
      [null],
      [{ tabId: "1", status: "handoff" }],
      [{ tabId: 99, status: "handoff" }],
      [{ tabId: 1, status: "bad" }],
      [
        { tabId: 1, status: "handoff" },
        { tabId: 1, status: "deliverable" },
      ],
    ])
      results.push(await outcome(() => s.finalizeTabs(request, keep)));
    await s.finalizeTabs(request, [{ tabId: 1, status: "handoff" }]);
    results.push(
      await outcome(() => s.runPassiveRead(request, async () => "blocked")),
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = outcome(() =>
      s.runLifecycle(async () => {
        trace.push(["queue.start"]);
        await gate;
        throw Error("queued failure");
      }),
    );
    const second = s.runLifecycle(async () => {
      trace.push(["queue.next"]);
      return "resumed";
    });
    await Promise.resolve();
    release();
    results.push(await first, await second);
    return results;
  });
});

test("restored RPC handler composes the original-derived session for tab reads, CDP and turn cleanup", async () => {
  const { createBrowserCommandHandlerWithSession } =
    await import("../packages/browser-extension/src/command_handler");
  const { ExtensionBrowserPeer } =
    await import("../packages/browser-extension/src/browser_peer");
  const { deps, leases, trace } = fixture(false);
  deps.chrome.storage = {
    local: { get: async () => ({}), set: async () => {} },
  };
  const Handler = createBrowserCommandHandlerWithSession(
    {
      chrome: deps.chrome,
      navigator: { userAgent: "fixture" },
      browserFamily: () => "chrome",
      tabLeases: deps.tabLeases,
      Siwc: class {} as any,
      buildChannel: () => "test",
      favicons: deps.tabFavicons,
      TabMentionProvider: class {
        getProviderTabId(id: number) {
          return `tab:${id}`;
        }
      } as any,
      initializeDebugger() {},
      initializeForeignExtensionFrameMonitor() {},
      initializePopupInterceptor() {},
      networkPolicy: deps.networkPolicy,
      getTab: deps.getTab,
      getUserTabs: async () => [],
      getUserHistory: async () => [],
      validateTabId() {},
      executeTabRead: async () => ({}),
      getTabContext: async () => ({}),
      browserInfo: deps.browserInfo,
      dispatchCommand: async () => ({}),
      commandSets: [null, null],
      commandNames: {} as any,
      schemas: {} as any,
      validateMouse() {},
      overlay: deps.overlay,
      canAnimateCursor: async () => false,
      instanceId: async () => "fixture",
      capabilities: {} as any,
      setTimeout,
      clearTimeout,
    },
    deps,
  );
  const handler = new Handler(),
    sent: any[] = [];
  const peer = new ExtensionBrowserPeer(
    { setMessageCallback() {}, sendMessage: (message) => sent.push(message) },
    handler,
  );
  await peer.handleIncomingMessage({
    id: 1,
    method: "getTabs",
    params: request,
  });
  assert.equal(sent[0].result[0].providerTabId, "tab:1");
  assert.equal(handler.sessions.get("s").currentTurnId, "t");
  await peer.handleIncomingMessage({
    id: 2,
    method: "executeCdp",
    params: {
      ...request,
      target: { tabId: 1 },
      method: "Runtime.evaluate",
      commandParams: { expression: "1" },
    },
  });
  assert.deepEqual(sent[1], { jsonrpc: "2.0", id: 2, result: { ok: true } });
  leases.set(1, { tabId: 1, turnId: "t", origin: "user" });
  await peer.handleIncomingMessage({
    id: 3,
    method: "turnEnded",
    params: request,
  });
  assert.equal(handler.sessions.get("s").currentTurnId, null);
  assert.equal(handler.sessions.get("s").endedTurnIds.has("t"), true);
  assert.ok(
    trace.some(
      (entry) => entry[0] === "leases.release" && entry[2].includes(1),
    ),
  );
});

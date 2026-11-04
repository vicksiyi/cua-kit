import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  startExtensionBackground,
  type BackgroundStartupHost,
} from "../packages/browser-extension/src/background_startup";
import {
  isChatGptPageSender,
  sendTabMentionsInvalidated,
} from "../packages/browser-extension/src/tab_mention_messages";
import { isAgentPopupRequest } from "../packages/browser-extension/src/popup_interceptor";
import { isBrowserPageEvent } from "../packages/browser-extension/src/background_messages";
import { filterCdpEvent } from "../packages/browser-extension/src/cdp_security";

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
async function run(restored: boolean, mode: string) {
  const trace: any[] = [],
    callbacks: Record<string, any> = {};
  const event = (name: string) => ({
    addListener(fn: any) {
      trace.push(["listen", name]);
      callbacks[name] = fn;
    },
  });
  const chrome: any = {
    runtime: {
      id: "extension",
      getManifest: () => ({ version: "1" }),
      onConnect: event("connect"),
      onMessage: event("message"),
      sendMessage: async (value: any) => {
        trace.push(["runtime-send", value]);
      },
    },
    debugger: { onDetach: event("detach"), onEvent: event("cdp") },
    downloads: { onCreated: event("created"), onChanged: event("changed") },
    webNavigation: { onCreatedNavigationTarget: event("navigation") },
    ...(mode === "no-side-api" ? {} : { sidePanel: {} }),
  };
  const peer = (kind: string) => ({
    ping: async () => {
      trace.push(["ping", kind]);
      return kind;
    },
    sendCdpDetach: (v: unknown) => trace.push(["detach", kind, v]),
    sendCdpEvent: (v: unknown) => trace.push(["cdp", kind, v]),
    sendDownloadChange: (v: unknown) => trace.push(["download", kind, v]),
    sendPageEvent: (v: unknown) => trace.push(["page", kind, v]),
    sendBrowserTabMentionsInvalidated: () => trace.push(["invalidated", kind]),
  });
  const handler = {
    addDownloadChangeListener: event("download-change").addListener,
    handleDownloadCreated: (v: unknown) => trace.push(["created", v]),
    handleDownloadChanged: (v: unknown) => trace.push(["changed", v]),
    handleCreatedNavigationTarget: async (v: unknown) =>
      trace.push(["navigation", v]),
    turnEnded: async (v: unknown) => trace.push(["fallback-turn", v]),
    handleAgentBackgroundPopup: async (id: number, url: string) =>
      trace.push(["popup", id, url]),
  };
  const installation = { refresh: () => trace.push(["install-refresh"]) };
  const provider = {
    subscribeInvalidations: (fn: any) => {
      trace.push(["subscribe-mentions"]);
      callbacks.provider = fn;
    },
  };
  const host: BackgroundStartupHost = {
    chrome,
    buildChannel: (value) => {
      trace.push(["channel", value]);
      return "prod";
    },
    nativeHosts: (channel) => {
      trace.push(["hosts", channel]);
      return ["host"];
    },
    sidePanelEnabled: () => mode !== "side-disabled",
    createInstallation: (fn) => {
      trace.push(["installation"]);
      callbacks.installed = fn;
      return installation;
    },
    refreshWebsite: async (...args) => trace.push(["website", ...args]),
    clearActionCallout: async (value) => {
      trace.push(["clear", value]);
      throw Error("ignored");
    },
    createUpdates: (active) => {
      trace.push(["updates", active()]);
      return {
        register: () => trace.push(["updates-register"]),
        maybeReloadForPendingUpdate: async () => trace.push(["reload"]),
      };
    },
    isControlActive: () => false,
    onControlActivity: (fn) => {
      trace.push(["activity"]);
      callbacks.activity = fn;
    },
    createMentionProvider: (channel, observe) => {
      trace.push(["provider", channel]);
      callbacks.observe = observe;
      return provider;
    },
    observeMentionInvalidations: (fn) => {
      trace.push(["observe-tabs"]);
      callbacks.tabs = fn;
    },
    createHandler: (options) => {
      trace.push([
        "handler",
        options.buildChannel,
        options.browserTabMentionProvider === provider,
      ]);
      return handler;
    },
    createWebMcpConfig: () => {
      trace.push(["webmcp"]);
      return { enabled: async () => true };
    },
    isEnabled: async (name) => {
      trace.push(["flag", name]);
      return true;
    },
    observeGate: async (name, fn, signal) => {
      trace.push(["observe-gate", name]);
      callbacks.gate = fn;
      callbacks.gateSignal = signal;
      if (mode === "gate-error") throw Error("gate");
    },
    registerKernelConnections: (connected, disconnected) => {
      trace.push(["kernel-connect-listen"]);
      callbacks.kernel = connected;
      callbacks.disconnect = disconnected;
    },
    createControl: (id) => {
      trace.push(["control", id]);
      return { id };
    },
    createControlPeer: (_transport, control) => ({
      sendTurnEnded: async (metadata) => {
        trace.push(["kernel-turn", control, metadata]);
        if (mode === "turn-error") throw Error("turn");
      },
    }),
    createBrowserPeer: (transport: any, shared) => {
      trace.push(["peer", transport.kind, shared === handler]);
      return peer(transport.kind);
    },
    registerTurnEnded: async (fn) => {
      trace.push(["turn-listen"]);
      callbacks.turn = fn;
    },
    reportTurnEndedError: (error) => trace.push(["turn-error", String(error)]),
    createNativeTransport: (hosts) => {
      trace.push(["transport", hosts]);
      return { kind: "native" } as any;
    },
    registerToolbarState: () => trace.push(["toolbar"]),
    registerSidePanelEntrypoints: () => trace.push(["side-entry"]),
    registerSidePanelTabs: () => trace.push(["side-tabs"]),
    createSidePanelAuth: (url, fn) => {
      trace.push(["side-auth", url]);
      callbacks.auth = fn;
      return () => false;
    },
    refreshAuth: async () => trace.push(["auth-refresh"]),
    ensureLeases: async () => {
      trace.push(["leases"]);
      if (mode === "lease-error") throw Error("lease");
    },
    getLease: async () => ({ sessionId: "s" }),
    tabMentionPort: (_provider, channel, port) =>
      trace.push(["mention-port", channel, port.name]),
    nativeStatusPort: (_transport, version, channel, port) =>
      trace.push(["status-port", version, channel, port.name]),
    sidePanelInstance: () => false,
    refreshBrowserSettings: async (control) =>
      trace.push(["settings", control]),
    tabMentionMessage: () => false,
    websiteStatus: () => false,
    showInstaller: () => false,
    sidePanelLoad: () => false,
    openSidePanel: () => false,
    cursor: () => false,
    initializeInstanceId: async () => trace.push(["identity"]),
    registerLifecycle: (options) =>
      trace.push([
        "lifecycle",
        options.buildChannel,
        options.sidePanelEnabled,
        options.browserPluginInstallation === installation,
      ]),
    initializeTelemetry: async () => {
      trace.push(["telemetry"]);
      if (mode === "telemetry-error") throw Error("telemetry");
    },
    registerHeartbeat: async (...pings) => {
      trace.push(["heartbeat"]);
      callbacks.pings = pings;
    },
    reportError: (error, stage) => trace.push(["error", stage, String(error)]),
    console: {
      warn: (value) => trace.push(["warn", value]),
      error: (value) => trace.push(["error-log", value]),
    },
  };
  const original = () =>
    extensionBindings(["dR", "cR", "oR", "lR"], {
      chrome,
      Rr: host.buildChannel,
      uR: host.nativeHosts,
      I_: host.sidePanelEnabled,
      rk: host.createInstallation,
      Cf: host.refreshWebsite,
      pk: host.clearActionCallout,
      _k: class {
        constructor(active: any) {
          return host.createUpdates(active);
        }
      },
      Ie: {
        isBrowserControlActive: host.isControlActive,
        setBrowserControlActivityChangeHandler: host.onControlActivity,
      },
      Xu: class {
        constructor(channel: string, _favicons: any, observe: any) {
          return host.createMentionProvider(channel, observe);
        }
      },
      Ma: { getInstance: () => ({}) },
      kS: host.observeMentionInvalidations,
      hR: sendTabMentionsInvalidated,
      pE: class {
        constructor(options: any) {
          return host.createHandler(options);
        }
      },
      Wk: host.createWebMcpConfig,
      Is: host.isEnabled,
      Ds: class {
        constructor(id: string) {
          return host.createControl(id) as object;
        }
        static refreshBrowserSettings = host.refreshBrowserSettings;
      },
      pc: class {
        constructor(transport: any, handler: any) {
          return host.createBrowserPeer(transport, handler);
        }
      },
      qg: class {
        constructor(transport: any, control: any) {
          return host.createControlPeer(transport, control);
        }
      },
      Wg: host.registerKernelConnections,
      S_: host.registerTurnEnded,
      g_: host.reportTurnEndedError,
      As: host.observeGate,
      zi: host.reportError,
      console: host.console,
      GE: class {
        constructor(hosts: string[]) {
          return host.createNativeTransport(hosts);
        }
      },
      jk: host.registerToolbarState,
      Ok: host.registerSidePanelEntrypoints,
      Ek: host.registerSidePanelTabs,
      Yk: host.createSidePanelAuth,
      Mr: host.refreshAuth,
      st: {
        getInstance: () => ({
          ensureInit: host.ensureLeases,
          getActiveLease: host.getLease,
        }),
      },
      KC: host.tabMentionPort,
      vk: host.nativeStatusPort,
      wk: host.sidePanelInstance,
      cn: (sender: any, channel: string) =>
        isChatGptPageSender(sender, channel, chrome.runtime.id),
      Oy: isAgentPopupRequest,
      Dp: isBrowserPageEvent,
      Tf: host.tabMentionMessage,
      tR: host.websiteStatus,
      sk: host.showInstaller,
      Zk: host.sidePanelLoad,
      xk: host.openSidePanel,
      fR: host.cursor,
      Yp: filterCdpEvent,
      Be: host.initializeInstanceId,
      Hk: host.registerLifecycle,
      hi: { initialize: host.initializeTelemetry },
      Gk: host.registerHeartbeat,
    }).dR();
  try {
    await (restored ? startExtensionBackground(host) : original());
  } catch (error) {
    trace.push(["startup-error", String(error)]);
  }
  await flush();
  if (mode !== "telemetry-error") {
    await callbacks.installed();
    callbacks.auth?.();
    callbacks.activity(false);
    callbacks.activity(true);
    callbacks.gate(true);
    callbacks.gate(true);
    callbacks.kernel("scope", { kind: "kernel" }, {});
    callbacks.connect({ name: "test" });
    callbacks.observe();
    callbacks.tabs();
    callbacks.provider();
    callbacks.detach({ tabId: 1 });
    callbacks.message(
      { type: "codex:page-event", event: { version: 1, type: "test" } },
      { tab: { id: 1 } },
      () => {},
    );
    callbacks.message(
      { type: "BROWSER_SETTINGS_UPDATED" },
      {
        id: "extension",
        frameId: 0,
        url: "https://chatgpt.com/",
        origin: "https://chatgpt.com",
        tab: { id: 1, windowId: 1 },
      },
      (value: any) => trace.push(["reply", value]),
    );
    await flush();
    for (const ping of callbacks.pings) await ping();
    try {
      await callbacks.turn("scope", { turn_id: "t" });
    } catch (error) {
      trace.push(["turn-caught", String(error)]);
    }
    callbacks.disconnect("scope");
    callbacks.tabs();
    await callbacks.turn("scope", { turn_id: "after" });
  }
  await flush();
  return trace;
}
test("complete restored startup matches installed dR ordering, routing and failure paths", async () => {
  for (const mode of [
    "normal",
    "side-disabled",
    "no-side-api",
    "lease-error",
    "gate-error",
    "turn-error",
    "telemetry-error",
  ])
    assert.deepEqual(await run(true, mode), await run(false, mode), mode);
});

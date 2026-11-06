import assert from "node:assert/strict";
import test from "node:test";
import { createExtensionBackground } from "../packages/browser-extension/src/background_assembly";
import { createKernelScopeRegistry } from "../packages/browser-extension/src/kernel_scope";

test("full background factory binds real control, storage, scope and runtime services", async () => {
  const stored: Record<string, unknown> = {},
    listeners: Record<string, Function[]> = {},
    menus: unknown[] = [];
  const event = (name: string) => ({
    addListener(fn: Function) {
      (listeners[name] ??= []).push(fn);
    },
    removeListener(fn: Function) {
      listeners[name] = listeners[name]?.filter((item) => item !== fn);
    },
  });
  const storage = {
    get: async (key: string) => ({ [key]: stored[key] }),
    set: async (values: any) => {
      Object.assign(stored, values);
    },
  };
  const chrome: any = {
    storage: { session: storage, local: storage },
    runtime: {
      id: "test",
      getURL: (path: string) => `chrome-extension://test/${path}`,
      getManifest: () => ({ version: "1" }),
      onInstalled: event("installed"),
      onStartup: event("startup"),
    },
    tabs: { query: async () => [{ id: 17, windowId: 3, active: true }] },
    webNavigation: { onCompleted: event("completed") },
    action: {
      setBadgeText: async (value: unknown) => {
        stored.badge = value;
      },
      setBadgeBackgroundColor: async () => {},
    },
    contextMenus: { create: (value: unknown) => menus.push(value) },
    sidePanel: {},
  };
  const scope = new EventTarget();
  const registry = createKernelScopeRegistry<any, any>();
  const active = registry.begin("scope", {}, new AbortController().signal, {});
  let networkCalls = 0,
    initialized = 0;
  let receivedFoundation: unknown;
  const assembled = createExtensionBackground({
    host: {
      chrome,
      crypto,
      now: Date.now,
      setTimeout,
      clearTimeout,
      error: () => {},
      fetch: async () => {
        networkCalls++;
        throw Error("unexpected network");
      },
    },
    navigator: { userAgent: "Chrome/130" },
    channel: "dev",
    nativeHosts: ["com.core.test"],
    sidePanelEnabled: true,
    scope,
    features: { sdkKey: "fixture", api: "https://feature.invalid" },
    kernel: (foundation) => {
      receivedFoundation = foundation;
      return {
        getScope: registry.get,
        siteStatusUrl: new URL(
          "https://chatgpt.com/backend-api/aura/site_status",
        ),
        defaultAllowedPages: [],
        capturePdf: async () => null,
        deletePdf: async () => {},
        registerTurnEnded: async () => {},
      };
    },
    telemetry: {
      initialize: async () => {
        initialized++;
      },
      reportError: () => {},
      reportTurnEndedError: () => {},
    },
    console,
  });
  assert.equal(
    networkCalls,
    0,
    "Constructing bindings must not fabricate or request auth",
  );
  assert.equal(receivedFoundation, assembled.foundation);
  const control: any = assembled.startup.createControl("scope");
  await control.writeSessionConfig({
    sessionId: "s",
    config: { allowed: true },
  });
  assert.deepEqual(stored["browser-use-session-config:s"], { allowed: true });
  assert.deepEqual(await control.readSessionConfig("s"), { allowed: true });
  let incoming!: (value: any) => void, closed!: () => void;
  const messages: any[] = [];
  assembled.startup.createControlPeer(
    {
      setMessageCallback: (fn) => {
        incoming = fn;
      },
      sendMessage: (value) => messages.push(value),
      addCloseListener: (fn) => {
        closed = fn;
      },
    },
    control,
  );
  incoming({ id: 1, method: "displayValue", params: { value: 7 } });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.deepEqual(active.content, [{ type: "text", text: '{"value":7}' }]);
  assert.ok(messages.some((value) => value.id === 1 && !value.error));
  const abort = new AbortController();
  control.fetches.set("request", abort);
  closed();
  assert.equal(abort.signal.aborted, true);
  await assembled.startup.clearActionCallout("");
  assert.deepEqual(stored.badge, { text: "" });
  const installation = assembled.startup.createInstallation(async () => {});
  const cleanup: any = assembled.startup.registerLifecycle({
    buildChannel: "dev",
    sidePanelEnabled: true,
    browserPluginInstallation: installation,
  });
  // A non-install/update event still creates the menu; it must not re-register click handlers.
  listeners.installed[0]({ reason: "chrome_update" });
  assert.equal(menus.length, 1);
  assert.equal((menus[0] as any).id, "ask-chatgpt");
  cleanup();
  assert.equal(listeners.installed.length, 0);
  assert.equal(listeners.startup.length, 0);
  assert.equal(listeners.completed.length, 0);
  await assembled.startup.initializeObservedTabs();
  assert.equal(assembled.foundation.observedTabs.isObserved(17), true);
  assert.equal(initialized, 0, "observed tab initialization is not telemetry");
  active.dispose();
  assert.throws(
    () => control.displayValue("late"),
    /not executing|not active|scope/i,
  );
  assert.equal(networkCalls, 0);
});

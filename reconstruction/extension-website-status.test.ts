import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  createInstallerStatus,
  createWebsiteStatusHandler,
} from "../packages/browser-extension/src/website_status";
const names = [
  "Xt",
  "hm",
  "fm",
  "Nc",
  "_s",
  "cn",
  "__",
  "ik",
  "kf",
  "sk",
  "ak",
  "vk",
];
const sender: any = {
  id: "fixture",
  frameId: 0,
  documentLifecycle: "active",
  origin: "https://chatgpt.com",
  url: "https://chatgpt.com/",
  tab: { id: 4, windowId: 2 },
};
const capabilities = {
  browserTabMentionsSearch: "browserTabMentions.search",
  browserControlStateRead: "browserControl.state.read",
  extensionUpdateRead: "extension.update.read",
  nativeHostStatus: "nativeHost.status",
  sidePanelOpen: "sidePanel.open",
  sidePanelPromptPrefill: "sidePanel.promptPrefill",
  sidePanelStateRead: "sidePanel.state.read",
  toolbarPinRead: "toolbar.pin.read",
  websiteActionRequest: "website.action.request",
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture(upstream: boolean, mode: string) {
  const trace: any[] = [],
    messages = new Set<Function>(),
    disconnected = new Set<Function>();
  let identityReads = 0,
    release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const event = (name: string, listeners: Set<Function>) => ({
    addListener(fn: Function) {
      trace.push(["add", name]);
      listeners.add(fn);
    },
    removeListener(fn: Function) {
      trace.push(["remove", name]);
      listeners.delete(fn);
    },
  });
  const chrome: any = {
    runtime: { id: "fixture" },
    storage: {
      local: {
        async get(key: any) {
          trace.push(["local", key]);
          return { lastSeenExtensionActionCalloutVersion: 2 };
        },
      },
      session: {
        async get(keys: any) {
          trace.push(["session", keys]);
          return {
            codexSidePanelOpenWindowIds: [2, "2", 1.5],
            codexPendingUpdateVersion: "new",
          };
        },
      },
    },
    tabs: {
      async get(id: number) {
        trace.push(["tab", id]);
        return { windowId: 2 };
      },
    },
    action: {
      async getUserSettings() {
        trace.push(["toolbar"]);
        return { isOnToolbar: true };
      },
    },
    sidePanel: mode === "no-panel" ? undefined : { open() {} },
    downloads: {
      async search(query: any) {
        trace.push(["download", query]);
        return [{ state: "in_progress", totalBytes: 10, bytesReceived: 12 }];
      },
    },
  };
  const instanceId = async () => {
    trace.push(["identity"]);
    identityReads++;
    if (mode === "blocked") await gate;
    if (mode === "fail" || (mode === "retry" && identityReads === 1))
      throw Error("identity failed");
    return "profile";
  };
  const metric = (...args: any[]) => trace.push(["metric", ...args]);
  const overlay = { isBrowserControlActive: () => true };
  const bindings = upstream
    ? extensionBindings(names, {
        chrome,
        Be: instanceId,
        Yt: metric,
        Ie: overlay,
        Ye: capabilities,
        hn: "lastSeenExtensionActionCalloutVersion",
        jn: "codexSidePanelOpenWindowIds",
        fn: "codexPendingUpdateVersion",
      })
    : null;
  const handler = upstream
    ? bindings.vk
    : createWebsiteStatusHandler({
        chrome,
        instanceId,
        reportMetric: metric,
        isBrowserControlActive: overlay.isBrowserControlActive,
        readInstallerStatus: createInstallerStatus(chrome).readStatus,
      });
  const port: any = {
    name: mode === "other-port" ? "other" : "chatgpt-extension-status",
    sender: mode === "bad-sender" ? { ...sender, frameId: 1 } : sender,
    onMessage: event("message", messages),
    onDisconnect: event("disconnect", disconnected),
    disconnect() {
      trace.push(["disconnect"]);
      for (const fn of [...disconnected]) fn(port);
    },
    postMessage(value: any) {
      trace.push(["post", structuredClone(value)]);
      if (mode === "post-fails") throw Error("closed");
    },
  };
  const transport = {
    refreshStatus() {
      trace.push(["refresh"]);
      return {
        errorType: null,
        lastChecked: 123,
        state: mode === "connected" ? "connected" : "disconnected",
      };
    },
  };
  return {
    handler,
    port,
    transport,
    trace,
    messages,
    release: () => release(),
  };
}
test("website status port matches original incremental status, independent retries and disconnected suppression", async () => {
  for (const mode of [
    "normal",
    "connected",
    "no-panel",
    "retry",
    "fail",
    "blocked",
    "post-fails",
    "bad-sender",
    "other-port",
  ]) {
    const outputs = [];
    for (const upstream of [true, false]) {
      const f = fixture(upstream, mode);
      f.handler(f.transport, "installed", "prod", f.port);
      for (const fn of [...f.messages]) fn({ type: "refresh" });
      await flush();
      if (mode === "blocked") {
        f.port.disconnect();
        f.release();
        await flush();
      } else {
        for (const fn of [...f.messages]) fn({ type: "refresh" });
        await flush();
        f.port.disconnect();
      }
      await flush();
      outputs.push(f.trace);
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
    if (mode === "fail")
      assert.equal(outputs[1].filter((row) => row[0] === "metric").length, 2);
    if (mode === "connected")
      assert.equal(outputs[1].filter((row) => row[0] === "download").length, 0);
  }
});
test("installer status and show action match original download states and sender validation", async () => {
  for (const download of [
    undefined,
    { exists: false, state: "complete" },
    { state: "complete", id: 5 },
    { state: "interrupted" },
    { state: "in_progress", paused: true },
    { state: "in_progress", totalBytes: 0 },
    { state: "in_progress", totalBytes: 10, bytesReceived: 10 },
    { state: "in_progress", totalBytes: 10, bytesReceived: -1 },
  ]) {
    const outputs = [];
    for (const upstream of [true, false]) {
      const trace: any[] = [];
      const chrome: any = {
        runtime: { id: "fixture" },
        downloads: {
          async search(query: any) {
            trace.push(["search", query]);
            return download ? [download] : [];
          },
          show(id: number) {
            trace.push(["show", id]);
          },
        },
      };
      const original = upstream ? extensionBindings(names, { chrome }) : null;
      const restored = createInstallerStatus(chrome);
      const status = upstream
        ? await original.ak()
        : await restored.readStatus();
      const show = (source: any) =>
        upstream
          ? original.sk({ type: "SHOW_CODEX_INSTALLER" }, source, "prod")
          : restored.handleShow(
              { type: "SHOW_CODEX_INSTALLER" },
              source,
              "prod",
            );
      const accepted = [show(sender), show({ ...sender, id: "other" })];
      await flush();
      outputs.push({ status, accepted, trace });
    }
    assert.deepEqual(outputs[1], outputs[0]);
  }
});

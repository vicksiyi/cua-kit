import assert from "node:assert/strict";
import test from "node:test";
import { extensionFunctionCalls } from "./extension-source";
import { registerBackgroundRuntime } from "../packages/browser-extension/src/background_runtime";
import { filterCdpEvent } from "../packages/browser-extension/src/cdp_security";

test("background runtime registers in original order and preserves connection/error behavior", async () => {
  for (const mode of [
    "normal",
    "lease-reject",
    "identity-reject",
    "mention-throw",
  ]) {
    const outputs = [];
    for (const restored of [false, true]) {
      const trace: any[] = [];
      const listeners = new Map<string, Function>();
      const event = (name: string) => ({
        addListener(fn: Function) {
          trace.push(["listen", name]);
          listeners.set(name, fn);
        },
      });
      let version = "1";
      const chrome: any = {
        runtime: {
          onConnect: event("connect"),
          onMessage: event("message"),
          getManifest() {
            trace.push(["manifest", version]);
            return { version };
          },
        },
        debugger: { onDetach: event("detach"), onEvent: event("cdp") },
        downloads: { onCreated: event("created"), onChanged: event("changed") },
        webNavigation: { onCreatedNavigationTarget: event("navigation") },
      };
      const ensureLeases = async () => {
        trace.push(["restore"]);
        if (mode === "lease-reject") throw Error("lease");
      };
      const reportError = (error: any, stage: string) =>
        trace.push(["report", error.message, stage]);
      const error = (message: string) => trace.push(["error", message]);
      const tabMentionPort = (port: any) => {
        trace.push(["mention", port]);
        if (mode === "mention-throw") throw Error("mention");
      };
      const nativeStatusPort = (port: any, version: string, channel: string) =>
        trace.push(["native", port, version, channel]);
      const messageRouter = (...args: any[]) => {
        trace.push(["message", ...args]);
        return true;
      };
      const initializeInstanceId = async () => {
        trace.push(["identity"]);
        if (mode === "identity-reject") throw Error("identity");
      };
      const handler: any = {
        addDownloadChangeListener: event("download").addListener,
        handleDownloadCreated: (value: any) => trace.push(["created", value]),
        handleDownloadChanged: (value: any) => trace.push(["changed", value]),
        handleCreatedNavigationTarget: async (value: any) => {
          trace.push(["navigation", value]);
          throw Error("ignored");
        },
      };
      let peer = "first";
      const broadcast = (fn: any) =>
        fn({
          sendCdpDetach: (value: any) => trace.push([peer, "detach", value]),
          sendCdpEvent: (value: any) => trace.push([peer, "cdp", value]),
          sendDownloadChange: (value: any) =>
            trace.push([peer, "download", value]),
        });
      if (restored)
        registerBackgroundRuntime({
          chrome,
          buildChannel: "prod",
          ensureLeases,
          reportError,
          error,
          tabMentionPort,
          nativeStatusPort,
          messageRouter,
          handler,
          broadcast,
          initializeInstanceId,
        });
      else
        extensionFunctionCalls(
          "dR",
          [
            "g.ensureInit().catch",
            "chrome.runtime.onConnect.addListener",
            "chrome.runtime.onMessage.addListener",
            "chrome.debugger.onDetach.addListener",
            "chrome.debugger.onEvent.addListener",
            "u.addDownloadChangeListener",
            "chrome.downloads.onCreated.addListener",
            "Be().catch",
            "chrome.downloads.onChanged.addListener",
            "chrome.webNavigation.onCreatedNavigationTarget.addListener",
          ],
          {
            chrome,
            g: { ensureInit: ensureLeases },
            zi: reportError,
            console: { error },
            KC: (_provider: any, _channel: string, port: any) =>
              tabMentionPort(port),
            c: {},
            e: "prod",
            m: {},
            vk: (
              _transport: any,
              version: string,
              channel: string,
              port: any,
            ) => nativeStatusPort(port, version, channel),
            wk: messageRouter,
            h: broadcast,
            Yp: filterCdpEvent,
            u: handler,
            Be: initializeInstanceId,
          },
        );
      for (let i = 0; i < 2; i++) {
        version = String(i + 2);
        try {
          listeners.get("connect")!({ name: "port" });
        } catch (error: any) {
          trace.push(["caught", error.message]);
        }
      }
      assert.equal(listeners.get("message")!({}, {}, "reply"), true);
      listeners.get("detach")!({ tabId: 7 });
      peer = "second";
      listeners.get("download")!({ id: 2 });
      listeners.get("navigation")!({ tabId: 4 });
      for (let i = 0; i < 4; i++) await Promise.resolve();
      outputs.push(trace);
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});

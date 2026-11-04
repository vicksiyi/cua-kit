import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { registerExtensionLifecycle } from "../packages/browser-extension/src/extension_lifecycle";
test("extension lifecycle matches original registration, install/startup/navigation and cleanup", async () => {
  for (const mode of [
    "normal",
    "panel-disabled",
    "opera",
    "page-fails",
    "metric-fails",
    "website-fails",
    "auth-fails",
  ]) {
    const outputs = [];
    for (const upstream of [true, false]) {
      const trace: any[] = [],
        listeners = new Map<string, Function>();
      function event(name: string) {
        return {
          addListener(fn: Function, options?: unknown) {
            trace.push(["add", name, options]);
            listeners.set(name, fn);
          },
          removeListener(fn: Function) {
            assert.equal(fn, listeners.get(name));
            trace.push(["remove", name]);
            listeners.delete(name);
          },
        };
      }
      const chrome: any = {
        runtime: {
          onInstalled: event("installed"),
          onStartup: event("startup"),
        },
        webNavigation: { onCompleted: event("completed") },
        tabs: {
          async create(options: unknown) {
            trace.push(["page", options]);
            if (mode === "page-fails") throw Error("page");
          },
        },
      };
      const scope: any = {
        addEventListener(name: string, fn: Function) {
          trace.push(["add", name]);
          listeners.set(name, fn);
        },
        removeEventListener(name: string, fn: Function) {
          assert.equal(fn, listeners.get(name));
          trace.push(["remove", name]);
          listeners.delete(name);
        },
      };
      const browserFamily = () => {
        trace.push("browser-family");
        return mode === "opera" ? "opera" : "chrome";
      };
      let readers = 0;
      const createAuthReader = () => {
        trace.push(["reader", ++readers]);
        return Object.assign(async () => ({}), { index: readers });
      };
      const refreshAuth = async (reader: any) => {
        trace.push(["auth", reader.index]);
        if (mode === "auth-fails") throw Error("auth");
      };
      const refreshWebsite = async (...args: unknown[]) => {
        trace.push(["website", ...args]);
        if (mode === "website-fails") throw Error("website");
      };
      const reportToolbar = (trigger: string) => {
        trace.push(["toolbar", trigger]);
      };
      const registerContextMenu = () => {
        trace.push("menu");
      };
      const reportMetric = async (...args: unknown[]) => {
        trace.push(["metric", ...args]);
        if (mode === "metric-fails") throw Error("metric");
      };
      const warn = (message: string) => {
        trace.push(["warn", message]);
      };
      const installation = {
        refresh(reader?: any) {
          trace.push(["refresh", reader?.index]);
        },
        stop() {
          trace.push("stop");
        },
      };
      const options = {
        buildChannel: "dev",
        sidePanelEnabled: mode !== "panel-disabled",
        browserPluginInstallation: installation,
      };
      const original = upstream
        ? extensionBindings(["Xt", "gs", "Hk", "yk"], {
            chrome,
            self: scope,
            os: browserFamily,
            globalThis: { navigator: {} },
            Un: reportMetric,
            Xi: reportToolbar,
            Mk: registerContextMenu,
            Xc: createAuthReader,
            Mr: refreshAuth,
            Cf: refreshWebsite,
            Or: "https://chatgpt.com",
            console: { warn },
          })
        : undefined;
      const cleanup = upstream
        ? original.Hk(options)
        : registerExtensionLifecycle(
            {
              chrome,
              scope,
              browserFamily,
              createAuthReader: createAuthReader as any,
              refreshAuth,
              refreshWebsite,
              reportToolbar,
              registerContextMenu,
              reportMetric,
              warn,
            },
            options,
          );
      await new Promise((resolve) => setImmediate(resolve));
      for (const reason of [
        "install",
        "update",
        "chrome_update",
        "shared_module_update",
      ])
        listeners.get("installed")!({ reason });
      listeners.get("startup")!();
      listeners.get("activate")!();
      for (const [frameId, url] of [
        [1, "https://chatgpt.com/"],
        [0, "https://chatgpt-staging.com/"],
        [0, "https://chatgpt.com/anything"],
        [0, "invalid"],
      ]) {
        try {
          listeners.get("completed")!({ frameId, url });
        } catch (error) {
          trace.push(["throw", (error as Error).name]);
        }
      }
      await new Promise((resolve) => setImmediate(resolve));
      cleanup();
      assert.equal(listeners.size, 0);
      outputs.push(trace);
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});

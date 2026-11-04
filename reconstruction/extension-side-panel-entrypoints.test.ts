import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createSidePanelEntrypoints } from "../packages/browser-extension/src/side_panel_entrypoints";
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("side panel entrypoints preserve registration, icon no-toggle, shortcuts and fallback failures", async () => {
  for (const mode of [
    "normal",
    "already-open",
    "absent",
    "missing-open",
    "create-fails",
    "toggle-fails",
    "callout-fails",
  ]) {
    const outputs = [];
    for (const upstream of [true, false]) {
      const trace: any[] = [],
        clicks: Function[] = [],
        commands: Function[] = [];
      const chrome: any = {
        sidePanel: ["absent", "create-fails"].includes(mode)
          ? undefined
          : mode === "missing-open"
            ? {}
            : { open() {} },
        action: {
          onClicked: {
            addListener(fn: Function) {
              trace.push("register-icon");
              clicks.push(fn);
            },
          },
        },
        commands: {
          onCommand: {
            addListener(fn: Function) {
              trace.push("register-command");
              commands.push(fn);
            },
          },
        },
        tabs: {
          async create(options: any) {
            trace.push(["create", options]);
            if (mode === "create-fails") throw Error("create failed");
            return {};
          },
        },
        runtime: {
          getURL: (path: string) => `chrome-extension://fixture/${path}`,
        },
      };
      const showCallout = async () => {
        trace.push("callout");
        if (mode === "callout-fails") throw Error("callout failed");
      };
      const registerWindowEvents = () => {
        trace.push("window-events");
      };
      const registerContextMenu = () => {
        trace.push("context-menu");
      };
      const isOpen = (...args: any[]) => {
        trace.push(["isOpen", ...args]);
        return mode === "already-open";
      };
      const toggle = async (...args: any[]) => {
        trace.push(["toggle", ...args]);
        if (mode === "toggle-fails") throw Error("toggle failed");
      };
      const reportOpen = (source: string) => trace.push(["report", source]);
      const register = upstream
        ? extensionBindings(["_r", "Ok", "Ff", "Pk"], {
            chrome,
            mk: showCallout,
            Dk: registerWindowEvents,
            Lk: registerContextMenu,
            Gf: isOpen,
            jf: toggle,
            Hf: reportOpen,
          }).Ok
        : createSidePanelEntrypoints({
            chrome,
            showCallout,
            registerWindowEvents,
            registerContextMenu,
            isOpen,
            toggle,
            reportOpen,
          }).register;
      register();
      clicks[0]({ id: 4, windowId: 2 });
      clicks[0]({ id: 5 });
      for (const command of commands) {
        command("other", { id: 4, windowId: 2 });
        command("open-codex-side-panel", { id: 4, windowId: 2 });
      }
      await flush();
      outputs.push(trace);
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});

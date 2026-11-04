import assert from "node:assert/strict";
import test from "node:test";
import { sidePanelBinding } from "./side-panel-source";
import { createSidePanelPageController } from "../packages/browser-extension/src/side_panel_controller";
import * as protocol from "../packages/browser-extension/src/side_panel_protocol";
import {
  createSidePanelFrame,
  normalizeSidePanelConversationUrl,
} from "../packages/browser-extension/src/side_panel_page";
import { createSidePanelSelectionCapture } from "../packages/browser-extension/src/side_panel_selection_capture";
import { removeSidePanelSelectionObserver } from "../packages/browser-extension/src/side_panel_selection";
import { googleWorkspaceDocument } from "../packages/browser-extension/src/google_workspace";
function event() {
  const listeners = new Set<Function>();
  return {
    listeners,
    addListener: (fn: Function) => listeners.add(fn),
    removeListener: (fn: Function) => listeners.delete(fn),
    emit: (...args: any[]) => {
      for (const fn of [...listeners]) fn(...args);
    },
  };
}
const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
test("per-tab sidepanel lifecycle matches original auth, context, recovery, media and disposal", async () => {
  for (const mode of [
    "context",
    "wrong-origin",
    "wrong-source",
    "auth",
    "prefill",
    "timeout",
    "revalidate",
    "media",
    "owner-removed",
    "detached-root",
  ]) {
    async function scenario(restored: boolean) {
      const trace: any[] = [];
      let uid = 0,
        time = 1000,
        timerId = 0;
      const timers = new Map<number, { fn: Function; ms: number }>(),
        elements: any[] = [];
      function target() {
        const events = new Map<string, ReturnType<typeof event>>();
        return {
          events,
          addEventListener(name: string, fn: Function) {
            if (!events.has(name)) events.set(name, event());
            events.get(name)!.addListener(fn);
          },
          removeEventListener(name: string, fn: Function) {
            events.get(name)?.removeListener(fn);
          },
          emit(name: string, value?: unknown) {
            events.get(name)?.emit(value);
          },
        };
      }
      const view = target();
      const doc: any = {
        defaultView: view,
        hidden: false,
        createElement(tag: string) {
          const node: any = {
            ...target(),
            tag,
            hidden: false,
            isConnected: true,
            children: [],
            attributes: {},
            textContent: "",
            setAttribute(key: string, value: string) {
              node.attributes[key] = value;
            },
            append(...children: any[]) {
              node.children.push(...children);
            },
            replaceChildren(...children: any[]) {
              for (const old of node.children) old.isConnected = false;
              node.children = children;
            },
            remove() {
              node.isConnected = false;
            },
            contentWindow: {
              postMessage(value: any, origin: string) {
                trace.push(["post", value, origin]);
              },
            },
          };
          elements.push(node);
          return node;
        },
      };
      const container = doc.createElement("div");
      container.isConnected = mode !== "detached-root";
      const tab: any = {
        id: 7,
        windowId: 9,
        url: "https://example.com/",
        status: "complete",
        incognito: false,
      };
      const stored: any = {};
      if (mode === "prefill")
        stored["codexWorkSidePanelInvocation:7"] = {
          type: "browser_side_chat_prompt_prefill",
          createdAtMs: 1,
          prompt: "hello",
        };
      const tabEvents = Object.fromEntries(
        ["onRemoved", "onDetached", "onReplaced", "onUpdated"].map((name) => [
          name,
          event(),
        ]),
      );
      const changed = event(),
        message = event(),
        settings = event();
      const chrome: any = {
        tabs: {
          ...tabEvents,
          get: async (id: number) => ({ ...tab, id }),
          query: async () => [{ id: 99 }],
          create: async (value: any) => {
            trace.push(["tab-create", value]);
            return { id: 99 };
          },
          update: async (id: number, value: any) =>
            trace.push(["tab-update", id, value]),
          remove: async (id: number) => trace.push(["tab-remove", id]),
        },
        runtime: {
          id: "fixture",
          getURL: (path: string) => `chrome-extension://fixture/${path}`,
          onMessage: message,
          async sendMessage(value: any) {
            trace.push(["runtime", value]);
            return value.type === "GET_EXTENSION_INSTANCE_ID"
              ? { instanceId: "instance" }
              : { ok: true };
          },
        },
        storage: {
          session: {
            async get(key: string) {
              return { [key]: stored[key] };
            },
            async set(value: any) {
              Object.assign(stored, value);
              trace.push(["store", value]);
            },
            async remove(key: string) {
              delete stored[key];
              trace.push(["remove-store", key]);
            },
          },
          onChanged: changed,
        },
        action: {
          getUserSettings: async () => ({ isOnToolbar: true }),
          onUserSettingsChanged: settings,
        },
        commands: {
          getAll: async () => [
            { name: "open-codex-side-panel", shortcut: "Ctrl+X" },
          ],
        },
        scripting: {
          async executeScript(input: any) {
            trace.push(["script", input.args, input.target, input.world]);
            return [
              {
                documentId: "doc",
                result: {
                  selectedText: "selection",
                  revision: 1,
                  captureGeneration: 1,
                },
              },
            ];
          },
        },
      };
      const permission: any = { state: "prompt", ...target() };
      const host: any = {
        chrome,
        crypto: { randomUUID: () => `uuid-${++uid}` },
        navigator: { permissions: { query: async () => permission } },
        now: () => time,
        setTimeout: (fn: Function, ms: number) => {
          timers.set(++timerId, { fn, ms });
          return timerId;
        },
        clearTimeout: (id: number) => timers.delete(id),
        setInterval: (fn: Function, ms: number) => {
          timers.set(++timerId, { fn, ms });
          return timerId;
        },
        clearInterval: (id: number) => timers.delete(id),
      };
      const original = sidePanelBinding("ge", {
        ...host,
        globalThis: { chrome },
        Date: { now: host.now },
        $e: (id: number) => `codexWorkSidePanelConversationUrl:${id}`,
        je: (id: number) => `codexWorkSidePanelInvocation:${id}`,
        D: createSidePanelFrame,
        ne: normalizeSidePanelConversationUrl,
        Ne: protocol.isSideChatPromptPrefill,
        xe: protocol.sidePanelMessageTypes.contextInvalidated,
        _e: googleWorkspaceDocument,
        X: protocol.canReadSidePanelTab,
        pe: createSidePanelSelectionCapture(chrome),
        et: removeSidePanelSelectionObserver,
        ve: () => protocol.readSidePanelInstanceId(chrome.runtime),
        Be: protocol.isSideChatBrowserContext,
        Oe: protocol.sidePanelMessageTypes.context,
        te: protocol.sidePanelCapabilities,
        De: protocol.sidePanelMessageTypes.tabContextChanged,
        He: protocol.sidePanelMessageTypes.capabilities,
        nt: "CODEX_WORK_SIDE_PANEL_LOAD_EVENT",
        ze: protocol.sidePanelMessageTypes.authOpen,
        ot: 15000,
        Je: protocol.isSidePanelAuthRevalidate,
        Me: protocol.isSideChatContextRequest,
        Re: protocol.isSideChatOpenInBrowser,
        Pe: protocol.isSideChatAuthChanged,
        Qe: protocol.sidePanelMessageTypes.authState,
        ke: protocol.isSideChatMediaPermissionRequest,
        Ve: protocol.isSideChatCapabilitiesRequest,
        We: protocol.isSideChatTabContextRequest,
        Ge: protocol.isSideChatLocationChanged,
      });
      const panel = await (
        restored ? createSidePanelPageController(host) : original
      )({
        frameContainer: container,
        pageDocument: doc,
        tab,
        workModeUrl: "https://chatgpt.com/?surface=browser_side_chat",
      });
      if (!panel) return trace;
      let frame = container.children[0];
      frame.emit("load");
      const send = (data: any) =>
        view.emit("message", {
          data,
          origin:
            mode === "wrong-origin"
              ? "https://evil.invalid"
              : "https://chatgpt.com",
          source: mode === "wrong-source" ? {} : frame.contentWindow,
        });
      if (mode === "timeout") {
        time += 15000;
        for (const [id, timer] of [...timers])
          if (timer.ms === 15000) {
            timers.delete(id);
            timer.fn();
          }
        const retry = elements.find((e) => e.textContent === "Try again");
        retry?.emit("click");
        frame = container.children[0];
        frame.emit("load");
      }
      send({
        type: "browser_side_chat_context_requested",
        protocolVersion: 2,
        requestId: "request",
        includeSelection: true,
      });
      await flush();
      send({ type: "browser_side_chat_capabilities_requested" });
      send({
        type: "browser_side_chat_tab_context_requested",
        requestId: "tab-request",
      });
      await flush();
      if (mode === "auth") {
        send({
          type: "browser_side_chat_auth_state_changed",
          state: "expired",
        });
        const button = elements.find(
          (e) => e.textContent === "Continue to ChatGPT",
        );
        button?.emit("click");
        await flush();
        send({
          type: "browser_side_chat_auth_state_changed",
          state: "signed_in",
        });
      }
      if (mode === "revalidate") {
        message.emit(
          { type: "CODEX_WORK_SIDE_PANEL_AUTH_REVALIDATE", ownerTabId: 7 },
          { id: "fixture" },
        );
        await flush();
        frame = container.children[0];
        frame.emit("load");
      }
      if (mode === "media") {
        send({
          type: "browser_side_chat_media_permission_request",
          audio: true,
          video: true,
        });
        await flush();
        permission.state = "granted";
        permission.emit("change");
        await flush();
      }
      if (mode === "owner-removed") tabEvents.onRemoved.emit(7);
      send({
        type: "browser_side_chat_location_changed",
        url: "https://chatgpt.com/c/abc?surface=browser_side_chat",
      });
      send({
        type: "browser_side_chat_open_in_browser",
        url: "https://chatgpt.com/c/abc?surface=browser_side_chat",
      });
      await flush();
      panel.setActive(false);
      panel.setActive(true);
      await flush();
      panel.dispose();
      panel.dispose();
      await flush();
      trace.push({
        timers: timers.size,
        listeners: [
          ...Object.values(tabEvents),
          changed,
          message,
          settings,
        ].map((e: any) => e.listeners.size),
        ui: elements
          .filter((e) => ["h1", "button"].includes(e.tag))
          .map((e) => e.textContent),
      });
      return JSON.parse(JSON.stringify(trace));
    }
    assert.deepEqual(await scenario(true), await scenario(false), mode);
  }
});

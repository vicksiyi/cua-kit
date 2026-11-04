import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings, extensionFunctionCalls } from "./extension-source";
import {
  createBackgroundMessageRouter,
  isBrowserPageEvent,
} from "../packages/browser-extension/src/background_messages";
import { isAgentPopupRequest } from "../packages/browser-extension/src/popup_interceptor";
import { isChatGptPageSender } from "../packages/browser-extension/src/tab_mention_messages";

test("background message dispatch preserves original precedence, replies and leased event forwarding", async () => {
  for (const mode of [
    "instance",
    "auth",
    "mentions",
    "status",
    "installer",
    "load",
    "open",
    "cursor",
    "unknown",
    "settings",
    "settings-reject",
    "settings-unauthorized",
    "popup",
    "popup-reject",
    "popup-no-tab",
    "page",
    "page-no-lease",
    "page-reject",
    "page-fraction",
    "page-invalid",
  ]) {
    const outputs = [];
    for (const restored of [false, true]) {
      const trace: any[] = [];
      const sender: any = {
        id: "extension",
        frameId: 0,
        origin: "https://chatgpt.com",
        url: "https://chatgpt.com/",
        tab: { id: 7, windowId: 1 },
      };
      const message: any = mode.startsWith("settings")
        ? { type: "BROWSER_SETTINGS_UPDATED" }
        : mode.startsWith("popup")
          ? {
              type: "CODEX_OPEN_AGENT_BACKGROUND_POPUP",
              url: "https://fixture.invalid",
            }
          : mode.startsWith("page")
            ? {
                type: "codex:page-event",
                event: {
                  version: 1,
                  type: "unknown-event",
                  session_id: "untrusted",
                  tabId: 999,
                  extra: true,
                },
              }
            : { type: "unknown" };
      if (mode === "settings-unauthorized") sender.id = "other";
      if (mode === "popup-no-tab") delete sender.tab;
      if (mode === "page-fraction") sender.tab.id = 1.5;
      if (mode === "page-invalid") message.event.version = 2;
      const handler =
        (name: string) =>
        (..._args: any[]) => {
          trace.push(["handler", name]);
          return mode === name;
        };
      const sidePanelInstance = handler("instance"),
        sidePanelAuth = handler("auth"),
        tabMentions = handler("mentions"),
        websiteStatus = handler("status"),
        showInstaller = handler("installer"),
        sidePanelLoad = handler("load"),
        openSidePanel = handler("open"),
        cursor = handler("cursor");
      const controls = ["a", "b"];
      const refreshBrowserSettings = async (control: string) => {
        trace.push(["refresh", control]);
        if (control === "a" && mode === "settings-reject")
          throw Error("failed");
      };
      const handleAgentBackgroundPopup = async (id: number, url: string) => {
        trace.push(["popup", id, url]);
        if (mode === "popup-reject") throw Error("failed");
      };
      const getActiveLease = async (id: number) => {
        trace.push(["lease", id]);
        if (mode === "page-reject") throw Error("failed");
        return mode === "page-no-lease" ? null : { sessionId: "owned" };
      };
      const broadcastPageEvent = (event: any) => trace.push(["event", event]);
      let router: any;
      if (restored)
        router = createBackgroundMessageRouter({
          runtimeId: "extension",
          buildChannel: "prod",
          sidePanelInstance,
          sidePanelAuth,
          tabMentions,
          websiteStatus,
          showInstaller,
          sidePanelLoad,
          openSidePanel,
          cursor,
          controls: () => controls,
          refreshBrowserSettings,
          handleAgentBackgroundPopup,
          getActiveLease,
          broadcastPageEvent,
        });
      else
        extensionFunctionCalls("dR", ["chrome.runtime.onMessage.addListener"], {
          chrome: {
            runtime: {
              onMessage: {
                addListener(fn: any) {
                  router = fn;
                },
              },
            },
          },
          wk: sidePanelInstance,
          cn: (s: any, channel: string) =>
            isChatGptPageSender(s, channel, "extension"),
          e: "prod",
          s: new Map(
            controls.map((controlImpl) => [controlImpl, { controlImpl }]),
          ),
          Ds: { refreshBrowserSettings },
          l: sidePanelAuth,
          Oy: isAgentPopupRequest,
          u: { handleAgentBackgroundPopup },
          Dp: isBrowserPageEvent,
          g: { getActiveLease },
          h: (fn: any) => fn({ sendPageEvent: broadcastPageEvent }),
          Tf: (_provider: any, _channel: any, ...args: any[]) =>
            tabMentions(...args),
          c: {},
          tR: websiteStatus,
          sk: showInstaller,
          Zk: sidePanelLoad,
          xk: openSidePanel,
          fR: (_handler: any, ...args: any[]) => cursor(...args),
        });
      const result = router(message, sender, (value: any) =>
        trace.push(["reply", value]),
      );
      for (let i = 0; i < 6; i++) await Promise.resolve();
      outputs.push({ result, trace });
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
    if (mode === "page")
      assert.deepEqual(outputs[1].trace.at(-1), [
        "event",
        {
          version: 1,
          type: "unknown-event",
          session_id: "owned",
          tabId: 7,
          extra: true,
        },
      ]);
  }
});

test("page-event guard matches bundled permissive envelope validation", () => {
  const original = extensionBindings(["Dp"], {}).Dp;
  for (const value of [
    null,
    undefined,
    1,
    "event",
    {},
    { version: 1 },
    { version: 1, type: 2 },
    { version: 1, type: "" },
    { version: 1, type: "custom", extra: true },
    Object.create({ version: 1, type: "inherited" }),
    Object.assign([], { version: 1, type: "array" }),
  ])
    assert.equal(isBrowserPageEvent(value), original(value));
});

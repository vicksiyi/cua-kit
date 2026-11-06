import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Tab } from "../packages/browser/src/tab";
import { createNavigateTabUrlCommand } from "../packages/browser/src/service/commands/url_navigation";
import { defineCommand } from "../packages/browser/src/service/commands/define_command";
import { rejectBlockedNavigation } from "../packages/browser/src/service/cdp/page_load";
import { originalServiceBindings, serviceSourceSha256 } from "./service-source";
assert.equal(
  serviceSourceSha256,
  "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021",
);
async function run(original: boolean, mode: string) {
  const trace: any[] = [];
  let predicate: any, resolve: any, reject: any;
  const reset = async () => {
    trace.push("reset");
  };
  const ref = originalServiceBindings(
    [
      "Gh",
      "Mte",
      "i2",
      "Nte",
      "Fte",
      "Lte",
      "Ute",
      "Ote",
      "Ao",
      "Ln",
      "qte",
      "s2",
    ],
    {
      O: defineCommand,
      TO: reset,
      Nv: (x: any) => typeof x === "object" && x !== null,
      Ov: (e: any) => e.method === "Page.navigationBlocked",
      Un: rejectBlockedNavigation,
    },
  );
  const event = (method: string, params: any = {}, child = false) => ({
    method,
    params,
    source: { tabId: 7, ...(child ? { sessionId: "child" } : {}) },
  });
  const emit = (e: any) => {
    if (predicate(e)) resolve(e);
  };
  const ctx: any = {
    environment: mode === "chrome" ? "codex-app" : "orbit",
    clientInfo: { type: mode === "extension" ? "extension" : "cdp" },
    runtime: {
      preloadAccessibilityCore: () => {
        trace.push("preload");
        return () => trace.push("cancel");
      },
    },
    acquireAuthority: () => ({
      triggerNetworkEgress: (url: string) => ({
        assert: async () => {
          trace.push(["authorize", url]);
          if (mode === "denied") throw Error("denied");
        },
      }),
    }),
    followSessionTab: async (id: number) => {
      trace.push(["follow", id]);
    },
    documentResponses: {},
    getCurrentSessionId: () => "session",
    cdp: {
      on() {},
      removeListener() {},
      readDocumentState: async () => ({ href: "https://old.test" }),
      waitForEvent: (_id: any, p: any, options: any) => {
        predicate = p;
        options.signal.addEventListener("abort", () => trace.push("abort"));
        return new Promise((a, b) => {
          resolve = a;
          reject = b;
        });
      },
      call: async (_id: number, method: string, params: any, options: any) => {
        trace.push([method, params]);
        if (method === "Page.getFrameTree")
          return { frameTree: { frame: { id: "main" } } };
        if (method !== "Page.navigate") return {};
        if (mode === "early")
          emit(event("Page.frameStartedLoading", { frameId: "main" }));
        options?.beforeDispatch?.();
        if (mode === "same-document") {
          emit(event("Page.navigatedWithinDocument", { url: params.url }));
          return {};
        }
        if (mode === "child")
          emit(event("Page.frameStartedLoading", { frameId: "main" }, true));
        else emit(event("Page.frameStartedLoading", { frameId: "main" }));
        if (mode === "repeat")
          emit(event("Page.frameStartedLoading", { frameId: "main" }));
        if (mode === "navigate-error") throw Error("dispatch failed");
        if (mode === "wait-error") reject(Error("timeout"));
        else {
          emit(
            event("Page.frameNavigated", {
              frame: { id: "main", url: params.url },
            }),
          );
          emit(event("Page.loadEventFired"));
        }
        return mode === "error-text" ? { errorText: "navigation failed" } : {};
      },
    },
  };
  if (mode === "no-hook") delete ctx.runtime.preloadAccessibilityCore;
  const payload: any = {
    tab_id: "7",
    url: mode === "non-http" ? "about:blank" : "https://new.test",
    ...(mode === "no-request" ? {} : { prepare_accessibility: true }),
  };
  try {
    return {
      value: await (original ? ref.s2 : createNavigateTabUrlCommand(reset))(
        payload,
        ctx,
      ),
      trace,
    };
  } catch (e: any) {
    return { error: e.message, trace };
  }
}
test("navigation preloading matches source gating, dispatch arming, frame signals and error cancellation", async () => {
  for (const mode of [
    "normal",
    "chrome",
    "extension",
    "no-request",
    "non-http",
    "early",
    "same-document",
    "child",
    "repeat",
    "navigate-error",
    "wait-error",
    "error-text",
    "no-hook",
    "denied",
  ])
    assert.deepEqual(await run(false, mode), await run(true, mode), mode);
  assert.equal(
    (await run(false, "normal")).trace.filter((x) => x === "preload").length,
    1,
  );
  assert((await run(false, "navigate-error")).trace.includes("cancel"));
});
test("Tab.goto forwards the optional AX preparation marker exactly as the current client", async () => {
  const root =
    process.env.CUA_VENDOR_ROOT ??
    "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
  const source = await readFile(
    `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
    "utf8",
  );
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    "04d63754bb1134eae351c164e750c7a9b798de2757a734e7a62e14b63edf8de4",
  );
  const Original = (
    await import(
      `data:text/javascript;base64,${Buffer.from(source + "\nexport {Nh as Tab}").toString("base64")}`
    )
  ).Tab;
  async function capture(Class: any, options: any) {
    const calls: any[] = [];
    const tab = new Class({
      browserId: "b",
      tabPayload: { id: "7" },
      documentation: { get: async () => "" },
      transport: {
        send: async ({ command }: any) => {
          calls.push(command.parse());
          return {};
        },
      },
    });
    await tab.goto("https://fixture.test", options);
    return calls;
  }
  for (const options of [
    undefined,
    {},
    { prepareAccessibility: false },
    { prepareAccessibility: true },
  ])
    assert.deepEqual(
      await capture(Tab, options),
      await capture(Original, options),
    );
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { parse } from "acorn";
import * as restored from "../packages/browser-extension/src/side_panel_protocol";
import {
  wellFormed,
  parseExtensionInstanceId,
} from "../packages/browser-extension/src/instance_id";
import { sidePanelBinding } from "./side-panel-source";
const root =
  process.env.CUA_EXTENSION_SOURCE_ROOT ??
  `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
const source = await readFile(`${root}/chunks/src-BsTzWBmo.js`, "utf8");
assert.equal(
  createHash("sha256").update(source).digest("hex"),
  "2284e7e24f4fc756e5af9e00d652914415a238128e5dcf4ab02bb0388c130dd0",
);
const body: any = (
  parse(source, { ecmaVersion: "latest", sourceType: "module" }) as any
).body;
function original(name: string) {
  const n = body.find(
    (n: any) => n.type === "FunctionDeclaration" && n.id.name === name,
  );
  return new Function("ve", "Re", `return (${source.slice(n.start, n.end)})`)(
    (v: any) => typeof v === "string" && v.length > 0 && v.length <= 128,
    "browser_side_chat_capabilities_requested",
  );
}
test("sidepanel frame message guards match original including inherited and array fields", () => {
  const cases: [string, (v: unknown) => unknown, Record<string, unknown>][] = [
    [
      "Rt",
      restored.isSideChatAuthChanged,
      { type: "browser_side_chat_auth_state_changed", state: "signed_in" },
    ],
    [
      "wt",
      restored.isSideChatOpenInBrowser,
      {
        type: "browser_side_chat_open_in_browser",
        url: "https://chatgpt.com/",
      },
    ],
    [
      "Et",
      restored.isSideChatPromptPrefill,
      {
        type: "browser_side_chat_prompt_prefill",
        createdAtMs: 0,
        prompt: "hello",
      },
    ],
    [
      "At",
      restored.isSideChatTabContextRequest,
      { type: "browser_side_chat_tab_context_requested", requestId: "request" },
    ],
    [
      "_t",
      restored.isSideChatContextRequest,
      {
        type: "browser_side_chat_context_requested",
        protocolVersion: 2,
        requestId: "request",
        includeSelection: true,
      },
    ],
    [
      "yt",
      restored.isSideChatLocationChanged,
      {
        type: "browser_side_chat_location_changed",
        url: "https://chatgpt.com/",
      },
    ],
    [
      "vt",
      restored.isSideChatMediaPermissionRequest,
      {
        type: "browser_side_chat_media_permission_request",
        audio: true,
        video: false,
      },
    ],
    ["Ot", restored.isSideChatBrowserContext, { instanceId: "fixture" }],
    [
      "It",
      restored.isSideChatCapabilitiesRequest,
      { type: "browser_side_chat_capabilities_requested" },
    ],
  ];
  const mutations = [
    undefined,
    null,
    false,
    true,
    -1,
    0,
    2,
    NaN,
    Infinity,
    "",
    " ",
    "signed_out",
    "expired",
    "logout_requested",
    "work",
    "x".repeat(129),
    "x".repeat(8193),
    "x".repeat(80001),
  ];
  for (const [name, guard, valid] of cases) {
    const sourceGuard = original(name);
    const values: any[] = [
      null,
      undefined,
      5,
      "text",
      {},
      valid,
      Object.create(valid),
      Object.assign([], valid),
      { ...valid, extra: 1 },
    ];
    for (const field of new Set([
      ...Object.keys(valid),
      "mode",
      "selectedText",
    ]))
      for (const value of mutations) values.push({ ...valid, [field]: value });
    for (const value of values)
      assert.equal(
        guard(value),
        sourceGuard(value),
        `${name}: ${JSON.stringify(value)?.slice(0, 200)}`,
      );
  }
});
test("sidepanel tab and auth-revalidation guards preserve original boundary", () => {
  const tab = sidePanelBinding("X", { qe: wellFormed });
  for (const id of [undefined, -1, 0, 1.5, Number.MAX_SAFE_INTEGER, Infinity])
    for (const incognito of [false, true])
      for (const url of [
        undefined,
        "https://example.com/",
        "http://example.com/",
        "about:blank",
        "file:///tmp/a",
        "https://x/\ud800",
        "https://x/" + "a".repeat(16384),
      ]) {
        const value = { id, incognito, url };
        assert.equal(restored.canReadSidePanelTab(value), tab(value));
      }
  const auth = sidePanelBinding("Je", {
    Ze: (n: any) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0,
  });
  for (const value of [
    null,
    {},
    ...[-1, 0, 1.5, Infinity, "1"].map((ownerTabId) => ({
      type: "CODEX_WORK_SIDE_PANEL_AUTH_REVALIDATE",
      ownerTabId,
    })),
  ])
    assert.equal(restored.isSidePanelAuthRevalidate(value), auth(value));
});
test("sidepanel instance request uses original message and validation without swallowing errors", async () => {
  for (const value of [
    null,
    {},
    [],
    { instanceId: null },
    { instanceId: " " },
    { instanceId: "valid" },
    { instanceId: "\ud800" },
    Object.create({ instanceId: "inherited" }),
    "throw",
  ]) {
    async function scenario(current: boolean) {
      const trace: unknown[] = [];
      const chrome: any = {
        runtime: {
          async sendMessage(message: any) {
            trace.push(message);
            if (value === "throw") throw Error("disconnected");
            return value;
          },
        },
      };
      let result;
      try {
        result = await (current
          ? restored.readSidePanelInstanceId(chrome.runtime)
          : sidePanelBinding("ve", {
              chrome,
              tt: "GET_EXTENSION_INSTANCE_ID",
              Ue: parseExtensionInstanceId,
            })());
      } catch (e) {
        result = (e as Error).message;
      }
      return { trace, result };
    }
    assert.deepEqual(await scenario(true), await scenario(false));
  }
});

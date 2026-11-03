import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { originalServiceBindings } from "./service-source";
import {
  visibleDomExpression,
  visibleDomTags,
  visibleDomRoles,
  visibleDomAttributes,
  visibleDomBooleanAttributes,
} from "../packages/browser/src/service/input/visible_dom_page";
import { DomCuaGetVisibleDomCommand } from "../packages/browser/src/service/input/visible_dom";
import { DomCuaClickCommand } from "../packages/browser/src/service/commands/dom_input";
import { BrowserInput } from "../packages/browser/src/service/input";
import { waitForPageLoadEvent } from "../packages/browser/src/service/cdp/page_load";
const original = originalServiceBindings(
  ["no", "Ms", "oY", "iY", "sY", "aY", "_Y", "cY"],
  { wA: "codex-agent-overlay-root", vD: "const __name = (target) => target;" },
);
const html = `<style>body{margin:0}iframe{width:220px;height:90px}button,input,textarea{display:block}</style>
<button id="click" onclick="this.textContent='Clicked'">Click me</button>
<input name="password" value="synthetic-secret"><input name="query" value="ordinary">
<textarea name="notes">ordinary textarea</textarea><textarea name="password">synthetic-textarea-secret</textarea>
<input type="checkbox" checked><select><option selected>Choice</option></select>
<button hidden>Hidden button</button><button style="opacity:0.01">Transparent button</button>
<button aria-hidden="true">Aria hidden button</button><button style="pointer-events:none">No pointer</button>
<div id="codex-agent-overlay-root"><button>Overlay button</button></div>
<div>Static reviewer text</div><div id="shadow"></div>
<iframe srcdoc="<button>Frame button</button>"></iframe>`;
test("visible DOM page renderer matches original in Chromium across limits, clips and reviewer mode", async () => {
  assert.deepEqual(visibleDomTags, [...original.oY]);
  assert.deepEqual(visibleDomRoles, original.aY);
  assert.deepEqual(visibleDomAttributes, original.iY);
  assert.deepEqual(visibleDomBooleanAttributes, original.sY);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1000, height: 1000 },
    });
    await page.setContent(html);
    await page.evaluate(() => {
      document
        .querySelector("#shadow")!
        .attachShadow({ mode: "open" }).innerHTML =
        "<button>Shadow button</button>";
    });
    for (const reviewer of [false, true])
      for (const [chars, elements, clip] of [
        [20000, 200, undefined],
        [80, 200, undefined],
        [20000, 2, undefined],
        [20000, 200, { left: 0, top: 0, right: 1000, bottom: 30 }],
        [0, 0, undefined],
      ] as const) {
        async function collect(expression: string) {
          await page.evaluate(() => {
            delete (globalThis as any).__browserUseVisibleDomState;
            delete (globalThis as any).__browserUseReviewerVisibleDomState;
          });
          return await page.evaluate(expression);
        }
        const actual: any = await collect(
          visibleDomExpression(chars, elements, clip, reviewer),
        );
        assert.deepEqual(
          actual,
          await collect(original.cY(chars, elements, clip, reviewer)),
          `${reviewer}/${chars}/${elements}`,
        );
        const text = actual.items.map((x: any) => x.line).join("\n");
        assert.doesNotMatch(
          text,
          /synthetic-secret|synthetic-textarea-secret|Overlay button|Hidden button|Transparent button|No pointer|Aria hidden button/,
        );
        if (chars === 20000 && elements === 200 && clip == null) {
          assert.match(text, /Shadow button/);
          if (!reviewer) assert.match(text, /value="<redacted>"/);
          else assert.match(text, /Static reviewer text/);
        }
      }
  } finally {
    await browser.close();
  }
});
test("assembled visible DOM reads same-process iframe and drives real guarded Chromium click by public node ID", async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
        viewport: { width: 1000, height: 1000 },
      }),
      session = await page.context().newCDPSession(page);
    const cdp: any = new EventEmitter();
    cdp.platform = "linux";
    cdp.mainFrameIdsByTabId = new Map();
    cdp.addTabCleanupHandler = () => () => {};
    cdp.call = (_id: number, method: string, params: any) =>
      session.send(method as any, params);
    cdp.callTarget = (_target: any, method: string, params: any) =>
      session.send(method as any, params);
    // This fixture uses a same-process srcdoc frame; no OOPIF attachment claim.
    cdp.targetForFrameOrAttach = async () => ({ tabId: 7 });
    cdp.waitForPageLoadEvent = waitForPageLoadEvent.bind(cdp);
    for (const method of [
      "Page.frameNavigated",
      "Page.frameStartedLoading",
      "Page.navigatedWithinDocument",
      "Page.domContentEventFired",
      "Page.loadEventFired",
    ])
      session.on(method as any, (params: any) => {
        if (method === "Page.frameNavigated" && params.frame.parentId == null)
          cdp.mainFrameIdsByTabId.set(7, params.frame.id);
        cdp.emit("event", { method, params, source: { tabId: 7 } });
      });
    await session.send("Page.enable");
    await page.setContent(html);
    await page.frameLocator("iframe").getByRole("button").waitFor();
    const permissions: string[] = [];
    const ctx: any = {
      cdp,
      security: { currentTabUrl: async () => page.url() },
      acquireAuthority: () => ({
        observeContent: () => ({
          assert: async () => {
            permissions.push("observe");
          },
        }),
        actInFrame: () => ({
          assert: async () => {
            permissions.push("act");
          },
        }),
      }),
      followSessionTab: async () => {},
      cua: new BrowserInput(cdp, { moveMouse: async () => {} }),
    };
    const snapshot = await DomCuaGetVisibleDomCommand({ tab_id: 7 }, ctx);
    assert.match(snapshot, /Frame button/);
    assert.doesNotMatch(snapshot, /synthetic-secret|synthetic-textarea-secret/);
    const line = snapshot
      .split("\n")
      .find((line) => line.includes("Click me"))!;
    const id = line.match(/node_id=(\d+)/)![1];
    await DomCuaClickCommand({ tab_id: 7, node_id: id, timeout_ms: 500 }, ctx);
    assert.equal(await page.locator("#click").textContent(), "Clicked");
    const updated = await DomCuaGetVisibleDomCommand({ tab_id: 7 }, ctx);
    assert.match(updated, new RegExp(`node_id=${id}[^\\n]*Clicked`));
    assert.deepEqual(permissions, ["observe", "act", "observe"]);
    assert.equal(cdp.listenerCount("event"), 0);
  } finally {
    await browser.close();
  }
});

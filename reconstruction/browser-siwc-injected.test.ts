import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { playwrightInstallation } from "../packages/browser/src/service/playwright/injection";
import { upstreamPlaywrightSource } from "../packages/browser/src/service/playwright/upstream_source";
import { installSiwcHelpers } from "../packages/browser/src/service/playwright/siwc_injected";
import { serviceExpression, serviceSourceSha256 } from "./service-source";
assert.equal(
  serviceSourceSha256,
  "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021",
);
test("SIWC injected detector matches installed helper in real DOM and snapshot lifecycle", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    for (const original of [true, false]) {
      const page = await browser.newPage();
      await page.setContent(
        `<button id="named">Continue with ChatGPT</button><div data-oai-siwc-button>Marked</div><button aria-label="CHATGPT account"></button><button hidden>ChatGPT hidden</button><a>Other</a><div>ChatGPT text only</div><textarea>ChatGPT</textarea><div id="open"></div><div id="closed"></div>`,
      );
      await page.evaluate(() => {
        document
          .querySelector("#open")!
          .attachShadow({ mode: "open" }).innerHTML =
          "<button>ChatGPT shadow</button>";
        const closed = document
          .querySelector("#closed")!
          .attachShadow({ mode: "closed" });
        closed.innerHTML =
          "<button data-oai-siwc-button>Hidden shadow</button>";
        (window as any).closedControl = closed.firstElementChild;
      });
      let expression = playwrightInstallation(
        upstreamPlaywrightSource(),
      ).expression;
      if (original)
        expression = expression.replace(
          installSiwcHelpers.toString(),
          serviceExpression("PF"),
        );
      await page.evaluate(expression);
      const result = await page.evaluate(() => {
        const h = (window as any).__codexPlaywrightInjected;
        const initial = h.siwcDocumentId();
        const found = h.siwcDetect();
        const again = h.siwcDetect();
        const named = document.querySelector("#named")!;
        const ref = h.siwcRef(named);
        const closed = h.isSiwcControl((window as any).closedControl);
        const detached = document.createElement("button");
        const detachedAccepted = h.isSiwcControl(detached);
        h._lastAriaSnapshotForQuery = { elements: new Map(), refs: new Map() };
        const next = h.siwcDocumentId();
        const newRef = h.siwcRef(named);
        return {
          found,
          again,
          ref,
          newRef,
          changed: initial !== next,
          stable: next === h.siwcDocumentId(),
          closed,
          detachedAccepted,
        };
      });
      results.push(result);
      await page.close();
    }
    assert.deepEqual(results[1], results[0]);
    assert.equal(results[1].found.length, 5);
    assert.equal(results[1].closed, false);
    assert.equal(results[1].changed, true);
    assert.equal(results[1].stable, true);
    assert.notEqual(results[1].ref, results[1].newRef);
  } finally {
    await browser.close();
  }
});

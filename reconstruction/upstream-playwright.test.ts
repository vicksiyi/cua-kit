import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { injectedSource } from "./injected-source";
import { upstreamPlaywrightSource } from "../packages/browser/src/service/playwright/upstream_source";
import { playwrightInstallation } from "../packages/browser/src/service/playwright/injection";

test("full upstream injected script matches CUA selectors, snapshots, form actions and hit targets", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    for (const source of [injectedSource, upstreamPlaywrightSource()]) {
      const page = await browser.newPage({
        viewport: { width: 800, height: 600 },
      });
      await page.setContent(
        `<body><h1>Fixture</h1><button id="save">Save</button><label>Name<input id="name"></label><input id="date" type="date"><input id="number" type="number"><input id="check" type="checkbox"><div class="parent"><span>inside</span></div><div class="parent">empty</div><div id="shadow"></div><iframe title="child" srcdoc="<button>Child</button>"></iframe></body>`,
      );
      await page.evaluate(() => {
        document
          .querySelector("#shadow")!
          .attachShadow({ mode: "open" }).innerHTML =
          '<button id="shadow-button">Shadow</button>';
      });
      await page.evaluate(playwrightInstallation(source).expression);
      results.push(
        await page.evaluate(() => {
          const helper = (window as any).__codexPlaywrightInjected;
          const output: any = { selectors: [], fills: [] };
          for (const selector of [
            "button",
            'internal:role=button[name="Save"s]',
            'internal:text="inside"s',
            'div.parent >> internal:has="span"',
            'div.parent >> internal:has-not="span"',
            "button >> nth=1",
            "#shadow-button",
            "input:visible",
            "div:has(span)",
          ]) {
            try {
              output.selectors.push(
                helper
                  .querySelectorAll(helper.parseSelector(selector), document)
                  .map((e: Element) => e.id || e.textContent),
              );
            } catch (e: any) {
              output.selectors.push({ error: e.message });
            }
          }
          const first = helper.incrementalAriaSnapshot(document.body, {
            mode: "ai",
            track: "fixture",
          });
          output.first = {
            full: first.full,
            incremental: first.incremental,
            iframeRefs: first.iframeRefs,
            iframeDepths: first.iframeDepths,
          };
          document.querySelector("#save")!.textContent = "Saved";
          const second = helper.incrementalAriaSnapshot(document.body, {
            mode: "ai",
            track: "fixture",
          });
          output.second = {
            full: second.full,
            incremental: second.incremental,
            iframeRefs: second.iframeRefs,
            iframeDepths: second.iframeDepths,
          };
          for (const [id, value] of [
            ["date", "2026-11-04"],
            ["number", "bad"],
            ["name", "text"],
            ["check", "x"],
          ]) {
            const element = document.getElementById(id)!;
            try {
              output.fills.push({
                result: helper.fill(element, value),
                value: (element as HTMLInputElement).value,
              });
            } catch (e: any) {
              output.fills.push({ error: e.message });
            }
          }
          const button = document.querySelector("#save")!;
          const box = button.getBoundingClientRect();
          output.hit = helper.expectHitTarget(
            { x: box.x + box.width / 2, y: box.y + box.height / 2 },
            button,
          );
          output.policyInstalled = typeof helper.isProtectedCredentialField;
          return output;
        }),
      );
      await page.close();
    }
    assert.deepEqual(results[1], results[0]);
    assert.equal(results[1].hit, "done");
    assert.deepEqual(results[1].selectors[0], ["save", "shadow-button"]);
    assert.ok(results[1].first.full.includes("Fixture"));
    assert.ok(Object.keys(results[1].first.iframeDepths).length > 0);
    assert.equal(results[1].fills[0].result, "done");
    assert.equal(results[1].policyInstalled, "function");
  } finally {
    await browser.close();
  }
});

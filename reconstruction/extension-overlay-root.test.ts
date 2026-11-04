import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { contentBindingsSource } from "./extension-content-source";
import { compiledInjectedDeclarations } from "./injected-source";
const original = contentBindingsSource([
  "Oe",
  "Ln",
  "_",
  "F",
  "D",
  "le",
  "G",
  "Ke",
  "Bn",
  "Q",
  "T",
  "Hn",
  "ze",
]);
const restored = await compiledInjectedDeclarations(
  "packages/browser-extension/dist/overlay_root.js",
);
test("overlay root matches original closed-shadow creation, conflict handling and mutation lifecycle in Chromium", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    async function run(useOriginal: boolean, scenario: string) {
      const page = await browser.newPage();
      await page.setContent("<html><head></head><body></body></html>");
      await page.evaluate("globalThis.__name=(fn)=>fn");
      await page.evaluate(
        ({ source, useOriginal, scenario }) => {
          if (
            scenario === "collision" ||
            scenario === "stale" ||
            scenario === "other-tag"
          ) {
            const node = document.createElement(
              scenario === "other-tag" ? "span" : "div",
            );
            node.id = "codex-agent-overlay-root";
            if (scenario === "stale")
              node.dataset.codexAgentOverlayRoot = "true";
            document.body.appendChild(node);
          }
          const events: any[] = [];
          const Dn = (container: HTMLElement) => {
            events.push([
              "render",
              container.parentNode instanceof ShadowRoot,
              (container.parentNode as ShadowRoot).mode,
              container.parentNode?.firstChild?.textContent,
            ]);
            return () => events.push(["dispose"]);
          };
          const body = useOriginal
            ? `${source};return {ensure:Q,remove:ze,disconnect:Hn}`
            : `${source};return createOverlayRoot({document,HTMLDivElement,MutationObserver,render:Dn})`;
          (window as any).test = { api: new Function("Dn", body)(Dn), events };
        },
        { source: useOriginal ? original : restored, useOriginal, scenario },
      );
      const result = await page.evaluate(async (scenario) => {
        const { api, events } = (window as any).test;
        const states: any[] = [];
        const flush = async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
        };
        const capture = (value?: boolean) => {
          const root = document.getElementById("codex-agent-overlay-root");
          states.push({
            value,
            root: root?.outerHTML ?? null,
            closed: root?.shadowRoot === null,
          });
        };
        capture(api.ensure());
        capture(api.ensure());
        if (scenario === "collision" || scenario === "other-tag") {
          document.getElementById("codex-agent-overlay-root")!.remove();
          await flush();
          capture();
        }
        if (scenario === "moved") {
          document.body.appendChild(
            document.getElementById("codex-agent-overlay-root")!,
          );
          await flush();
          capture(api.ensure());
        }
        document.getElementById("codex-agent-overlay-root")?.remove();
        await flush();
        capture(api.ensure());
        document.body.appendChild(document.createElement("p"));
        await flush();
        capture(api.ensure());
        const replacement = document.createElement("html");
        replacement.innerHTML = "<head></head><body></body>";
        document.replaceChild(replacement, document.documentElement);
        await flush();
        capture(api.ensure());
        api.remove();
        capture();
        api.disconnect();
        return { states, events };
      }, scenario);
      await page.close();
      return result;
    }
    for (const scenario of [
      "normal",
      "collision",
      "stale",
      "other-tag",
      "moved",
    ]) {
      const actual = await run(false, scenario);
      assert.deepEqual(actual, await run(true, scenario), scenario);
      assert.ok(
        actual.events.some(
          (event) => event[0] === "render" && event[2] === "closed",
        ),
      );
      if (scenario === "normal") {
        assert.equal(actual.states[2].value, false);
        assert.equal(actual.states[4].value, true);
      }
    }
  } finally {
    await browser.close();
  }
});

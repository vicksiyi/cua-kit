import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import {
  compiledInjectedDeclarations,
  injectedExpression,
} from "./injected-source";
const names = [
  "O",
  "qt",
  "q",
  "st",
  "$",
  "kr",
  "X",
  "Cr",
  "Ze",
  "Q",
  "Nr",
  "Zi",
  "es",
  "ts",
  "rs",
  "ns",
  "fn",
  "Fe",
  "ot",
  "Dt",
  "mn",
  "He",
  "cs",
  "us",
  "hs",
  "fs",
  "ds",
  "ps",
  "gs",
  "ms",
  "bs",
  "vs",
  "xr",
  "ls",
];
const original = `let we, Ee, Se, _e; let Tr={}; ${names.map((name) => `const ${name}=${injectedExpression(name)};`).join("\n")} return ls;`;
const actual =
  (
    await Promise.all(
      [
        "text_matcher",
        "dom_text",
        "dom_visibility",
        "layout_selector",
        "selector_engines",
        "selector_evaluator",
      ].map((name) =>
        compiledInjectedDeclarations(
          `packages/browser/dist/service/playwright/injected/${name}.js`,
        ),
      ),
    )
  ).join("\n") + "\nreturn SelectorEvaluator;";

test("complete injected selector evaluator matches original engines, combinators, shadow traversal and score ordering", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<style>#anchor,#near,#far{position:absolute;top:200px;width:10px;height:10px}#anchor{left:100px}#near{left:120px}#far{left:160px}</style><main id="main"><section id="one"><button id="a" class="item">Alpha</button><span id="mid">Middle</span><button id="b" class="item">Beta</button><div id="group"><button id="c" class="item">Alpha child</button></div><button id="hidden" style="display:none">Invisible</button></section><section id="two"><button id="d">Delta</button></section><div id="host"></div></main><div id="anchor"></div><div id="far"></div><div id="near"></div>`,
    );
    await page.evaluate(() => {
      const root = document
        .querySelector("#host")!
        .attachShadow({ mode: "open" });
      root.innerHTML =
        '<button id="shadow">Alpha shadow</button><div id="nested"></div>';
      root.querySelector("#nested")!.attachShadow({ mode: "open" }).innerHTML =
        '<button id="deep">Deep</button>';
    });
    const observe = (source: string) =>
      page.evaluate((source) => {
        const Evaluator = new Function(source)();
        const evaluator = new Evaluator();
        const builders = {
          css(value: string) {
            return {
              simples: [
                { selector: { css: value, functions: [] }, combinator: "" },
              ],
            };
          },
          fn(name: string, args: any[] = [], base?: string) {
            return {
              simples: [
                {
                  selector: { css: base, functions: [{ name, args }] },
                  combinator: "",
                },
              ],
            };
          },
          chain(a: string, combinator: string, b: string) {
            return {
              simples: [
                { selector: { css: a, functions: [] }, combinator },
                { selector: { css: b, functions: [] }, combinator: "" },
              ],
            };
          },
        };
        const { css, fn, chain } = builders;
        const selectors: any[] = [
          css("button"),
          css(".item"),
          [css("#d"), css("#a"), css("#a"), css("#shadow")],
          fn("is", [css("#b"), css("#a")]),
          fn("where", [css(".item")]),
          fn("not", [css("#b")], "button"),
          fn("has", [css("#c")], "section"),
          fn("scope"),
          fn("light", [css("button")]),
          fn("visible", [], "button"),
          fn("text", ["alpha"]),
          fn("text-is", ["Alpha"]),
          fn("text-matches", ["^Alpha", "i"]),
          fn("has-text", ["Alpha"], "section"),
          fn("nth-match", [css("button"), 2]),
          fn("nth-match", [css("button"), 1.5]),
          fn("nth-match", [css("button"), NaN]),
          ...[">", "+", "~", "", ">="].map((combinator) =>
            chain("#one", combinator, "button"),
          ),
          chain("#a", "+", "span"),
          chain("#a", "~", "button"),
          chain("#host", ">", "button"),
          fn("near", [css("#anchor"), 100], "#far,#near"),
        ];
        const rows: any[] = [];
        for (const scope of [
          document,
          document.querySelector("#one")!,
          document.querySelector("#host")!,
          document.querySelector("#host")!.shadowRoot!,
        ])
          for (const pierceShadow of [false, true])
            for (let index = 0; index < selectors.length; index++) {
              const context = { scope, pierceShadow };
              try {
                const result = evaluator.query(context, selectors[index]);
                rows.push({
                  scope:
                    scope.nodeType === 9
                      ? "document"
                      : (scope as Element).id || "shadow-root",
                  pierceShadow,
                  index,
                  ids: result.map((e: Element) => e?.id),
                  matches: ["a", "b", "c", "d"].map((id) =>
                    evaluator.matches(
                      document.getElementById(id),
                      selectors[index],
                      context,
                    ),
                  ),
                });
              } catch (error: any) {
                rows.push({ index, error: error.name, message: error.message });
              }
            }
        const errors: any[] = [];
        for (const selector of [
          null,
          {},
          "button",
          { simples: [] },
          [],
          fn("unknown"),
          fn("text", []),
          fn("visible", [1]),
          fn("scope", [1]),
          fn("nth-match", [css("button"), 0]),
          chain("#one", "?", "button"),
        ]) {
          try {
            evaluator.query({ scope: document, pierceShadow: true }, selector);
            errors.push(null);
          } catch (error: any) {
            errors.push(error.message);
          }
        }
        return {
          rows,
          errors,
          engines: [...evaluator._engines.keys()],
          methods: Object.getOwnPropertyNames(Evaluator.prototype),
          counter: evaluator._retainCacheCounter,
        };
      }, source);
    const restored = await observe(actual);
    assert.deepEqual(restored, await observe(original));
    const doc = restored.rows.filter(
      (r: any) => r.scope === "document" && r.pierceShadow === true,
    );
    assert.deepEqual(doc.find((r: any) => r.index === 2).ids, [
      "a",
      "d",
      "shadow",
    ]);
    assert.deepEqual(doc.find((r: any) => r.index === 11).ids, ["a"]);
    assert.deepEqual(doc.at(-1).ids, ["near", "far"]);
    assert(doc[0].ids.includes("deep"));
    assert.equal(restored.counter, 0);
    assert(
      restored.errors.some((message: string) =>
        message?.includes("Unknown selector engine"),
      ),
    );
  } finally {
    await browser.close();
  }
});

test("evaluator nested cache lifetime, failure state and engine call ordering match original", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="root"><button id="a">Alpha</button></div>');
    const observe = (source: string) =>
      page.evaluate((source) => {
        const Evaluator = new Function(source)(),
          evaluator = new Evaluator(),
          scope = document.getElementById("root")!;
        const selector = {
          simples: [
            { selector: { css: "button", functions: [] }, combinator: "" },
          ],
        };
        const context = { scope, pierceShadow: true };
        const ownFields = Object.keys(evaluator);
        evaluator.begin();
        evaluator.begin();
        const first = evaluator.query(context, selector);
        const added = document.createElement("button");
        added.id = "added";
        scope.append(added);
        const cached = evaluator.query(context, selector),
          same = cached === first;
        evaluator.end();
        const nested = evaluator
          .query(context, selector)
          .map((e: Element) => e.id);
        evaluator.end();
        const refreshed = evaluator
          .query(context, selector)
          .map((e: Element) => e.id);
        added.remove();
        const trace: string[] = [];
        evaluator._engines.set("query-only", {
          query() {
            trace.push("query-only");
            return [scope.firstElementChild];
          },
        });
        evaluator._engines.set("match-only", {
          matches() {
            trace.push("match-only");
            return true;
          },
        });
        const composed = {
          simples: [
            {
              selector: {
                functions: [
                  { name: "query-only", args: [] },
                  { name: "match-only", args: [] },
                ],
              },
              combinator: "",
            },
          ],
        };
        const composedResult = evaluator
          .query(context, composed)
          .map((e: Element) => e.id);
        const previous = evaluator._scoreMap;
        let error: string | undefined;
        try {
          evaluator.query(context, {
            simples: [
              {
                selector: { functions: [{ name: "unknown", args: [] }] },
                combinator: "",
              },
            ],
          });
        } catch (e: any) {
          error = e.message;
        }
        const cacheSizes = Object.keys(evaluator)
          .filter((key) => key.startsWith("_cache"))
          .map((key) => [key, evaluator[key].size]);
        return {
          ownFields,
          same,
          cached: cached.map((e: Element) => e.id),
          nested,
          refreshed,
          trace,
          composedResult,
          error,
          counter: evaluator._retainCacheCounter,
          cacheSizes,
          scoreMapLeftOnFailure: evaluator._scoreMap !== previous,
        };
      }, source);
    const restored = await observe(actual);
    assert.deepEqual(restored, await observe(original));
    assert(restored.same);
    assert.deepEqual(restored.cached, ["a"]);
    assert.deepEqual(restored.refreshed, ["a", "added"]);
    assert.deepEqual(restored.trace, ["query-only", "match-only"]);
    assert(restored.cacheSizes.every((pair: any) => pair[1] === 0));
    assert(restored.scoreMapLeftOnFailure);
  } finally {
    await browser.close();
  }
});

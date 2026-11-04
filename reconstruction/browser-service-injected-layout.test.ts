import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  injectedExpression,
  injectedClassMethod,
  compiledInjectedDeclarations,
} from "./injected-source";
import {
  leftOfScore,
  rightOfScore,
  aboveScore,
  belowScore,
  nearScore,
  createLayoutEngine,
  layoutSelectorScore,
  layoutRelations,
} from "../packages/browser/src/service/playwright/injected/layout_selector";
const originalSource = `${["Zi", "es", "ts", "rs", "ns", "is", "fn", "Fe"].map((name) => `const ${name} = ${injectedExpression(name)};`).join("\n")} const method = ({${injectedClassMethod("to", "_queryLayoutSelector")}})._queryLayoutSelector; return {scores:[es,Zi,ts,rs,ns],relations:is,score:fn,engine:Fe,query:(owner,candidates,part,root)=>method.call(owner,candidates,part,root)};`;
const original = new Function(originalSource)();
const compiled =
  (await compiledInjectedDeclarations(
    "packages/browser/dist/service/playwright/injected/layout_selector.js",
  )) +
  "\nreturn {score:layoutSelectorScore,engine:createLayoutEngine,query:queryLayoutSelector};";
const rectangle = (
  left: number,
  top: number,
  width: number,
  height: number,
) => ({ left, top, right: left + width, bottom: top + height });
test("layout scoring preserves original gaps, penalties, thresholds and nearest non-self reference", () => {
  assert.deepEqual(layoutRelations, original.relations);
  const scorers = [
    leftOfScore,
    rightOfScore,
    aboveScore,
    belowScore,
    nearScore,
  ];
  for (const x of [-100, -10, 0, 10, 50, 60, 100])
    for (const y of [-80, -10, 0, 10, 50, 60])
      for (const size of [0, 10, 20])
        for (const maximum of [undefined, -1, 0, 10, 50, Infinity, NaN]) {
          const candidate = rectangle(x, y, size, size),
            anchor = rectangle(0, 0, 10, 10);
          for (let i = 0; i < scorers.length; i++)
            assert.equal(
              scorers[i](candidate, anchor, maximum),
              original.scores[i](candidate, anchor, maximum),
            );
        }
  assert.equal(
    nearScore(rectangle(40, 40, 10, 10), rectangle(0, 0, 10, 10)),
    undefined,
  );
  assert.equal(
    nearScore(rectangle(40, 40, 10, 10), rectangle(0, 0, 10, 10), 60),
    60,
  );
  assert.equal(
    rightOfScore(rectangle(20, 100, 10, 10), rectangle(0, 0, 10, 10), 10),
    110,
  );
  const self: any = { getBoundingClientRect: () => rectangle(20, 0, 10, 10) };
  assert.equal(layoutSelectorScore("near", self, [self]), undefined);
  const calls: string[] = [];
  const args: any[] = ["selector", 1];
  Object.defineProperty(args, 1, {
    get() {
      calls.push("distance");
      return 1;
    },
  });
  const evaluator: any = {
    query() {
      calls.push("query");
      return [];
    },
    _markScore() {
      calls.push("mark");
    },
  };
  createLayoutEngine("near").matches(self, args, {}, evaluator);
  const actual = [...calls];
  calls.length = 0;
  original.engine("near").matches(self, args, {}, evaluator);
  assert.deepEqual(actual, calls);
  for (const relation of layoutRelations)
    for (const parameters of [
      [],
      [1],
      [NaN],
      ["selector"],
      ["selector", 0],
      ["selector", NaN],
    ]) {
      function run(factory: any) {
        const trace: any[] = [];
        try {
          return {
            value: factory(relation).matches(self, parameters, "context", {
              query(context: any, selectors: any) {
                trace.push(["query", context, selectors]);
                return [
                  self,
                  { getBoundingClientRect: () => rectangle(0, 0, 10, 10) },
                ];
              },
              _markScore(element: any, score: any) {
                assert.equal(element, self);
                trace.push(["score", score]);
              },
            }),
            trace,
          };
        } catch (error: any) {
          return { error: error.message, trace };
        }
      }
      assert.deepEqual(run(createLayoutEngine), run(original.engine));
    }
});
test("layout query and evaluator engine match original on real Chromium with stable ties and multiple anchors", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<style>div{position:absolute;width:10px;height:10px}</style><div id="a" class="anchor" style="left:100px;top:100px"></div><div id="b" class="anchor" style="left:200px;top:100px"></div><div id="near" style="left:120px;top:100px"></div><div id="tie" style="left:120px;top:100px"></div><div id="far" style="left:160px;top:200px"></div><div id="left" style="left:50px;top:100px"></div>`,
    );
    const observe = (source: string) =>
      page.evaluate((source) => {
        const api = new Function(source)();
        const root = document;
        const candidates = [...document.querySelectorAll("div")];
        const results: any[] = [];
        const owner = {
          querySelectorAll(selector: string, scope: Document) {
            return [...scope.querySelectorAll(selector)];
          },
        };
        for (const name of ["left-of", "right-of", "above", "below", "near"])
          for (const distance of [undefined, 0, 10, 50, 100]) {
            const selected = [
              ...api.query(
                owner,
                candidates,
                { name, body: { parsed: ".anchor", distance } },
                root,
              ),
            ] as Element[];
            const scores: any[] = [];
            const matches = candidates.filter((element) =>
              api
                .engine(name)
                .matches(
                  element,
                  distance === undefined ? [".anchor"] : [".anchor", distance],
                  root,
                  {
                    query(scope: Document, args: string[]) {
                      return owner.querySelectorAll(args[0], scope);
                    },
                    _markScore(element: Element, score: number) {
                      scores.push([element.id, score]);
                    },
                  },
                ),
            );
            results.push({
              name,
              distance,
              selected: selected.map((e) => e.id),
              matches: matches.map((e) => e.id),
              scores,
            });
          }
        return results;
      }, source);
    const restored = await observe(compiled);
    assert.deepEqual(restored, await observe(originalSource));
    const near = restored.find(
      (r: any) => r.name === "near" && r.distance === undefined,
    )!;
    assert.deepEqual(near.selected, ["near", "tie", "left"]);
    assert(
      near.scores.some((entry: any) => entry[0] === "near" && entry[1] === 10),
    );
  } finally {
    await browser.close();
  }
});

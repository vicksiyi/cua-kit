import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { originalServiceBindings } from "./service-source";
import {
  querySelectorWithVisibleFallbackSource,
  selectorScopeFunctions,
} from "../packages/browser/src/service/playwright/selector_scope";
const original = originalServiceBindings(["ig", "au", "hF", "Ms", "no", "vne"]);
test("Playwright selector page source preserves original readable embedded helpers exactly", () => {
  assert.equal(querySelectorWithVisibleFallbackSource, original.au);
  assert.equal(selectorScopeFunctions(), original.ig.selectorScopeFunctions());
});
test("Playwright selector scope preserves real same-origin frame traversal and visible fallback", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const cases = [
      { selector: "button" },
      { selector: "button", strict: true },
      { selector: "#hidden" },
      { selector: ".absent" },
      { selector: "#one >> internal:control=enter-frame >> button" },
      { selector: "#absent >> internal:control=enter-frame >> button" },
      {
        selector:
          "#outer >> internal:control=enter-frame >> iframe >> internal:control=enter-frame >> input",
      },
      { selector: "#notframe >> internal:control=enter-frame >> button" },
      {
        selector: "iframe >> internal:control=enter-frame >> button",
        strict: true,
      },
      { selector: "#cross >> internal:control=enter-frame >> button" },
    ];
    for (const scenario of cases) {
      async function run(query: string, scope: string) {
        const page = await browser.newPage();
        try {
          await page.setContent(
            '<button id=visible>Visible</button><button id=hidden style="display:none">Hidden</button><div id=notframe></div><iframe id=one srcdoc="<button>Child</button>"></iframe><iframe id=outer></iframe><iframe id=cross sandbox srcdoc="<button>Sandbox</button>"></iframe>',
          );
          await page.frameLocator("#one").locator("button").waitFor();
          await page.evaluate(() => {
            const doc = (document.querySelector("#outer") as HTMLIFrameElement)
              .contentDocument!;
            doc.body.innerHTML = "<iframe></iframe>";
            doc.querySelector("iframe")!.contentDocument!.body.innerHTML =
              "<input value=nested>";
          });
          await page.evaluate(original.vne);
          return await page.evaluate(
            `(()=>{${query}${scope}let error,result;try{const initial=window.__codexPlaywrightInjected,parsed=initial.parseSelector(${JSON.stringify(scenario.selector)}),scope=selectorScopeFor(initial,parsed,${scenario.strict === true});if(scope){const target=querySelectorStrictWithVisibleFallback(scope.injected,scope.parsed,scope.root,${scenario.strict === true});result={chain:scope.frameChain.length,target:target?{tag:target.tagName,text:target.textContent,value:target.value}:null,injectedMatches:scope.injected===scope.root.defaultView.__codexPlaywrightInjected};}else result=null;}catch(e){error=e.message}return {result,error};})()`,
          );
        } finally {
          await page.close();
        }
      }
      const actual = await run(
          querySelectorWithVisibleFallbackSource,
          selectorScopeFunctions(),
        ),
        expected = await run(original.au, original.ig.selectorScopeFunctions());
      assert.deepEqual(actual, expected, JSON.stringify(scenario));
      if (
        scenario.selector === "#one >> internal:control=enter-frame >> button"
      )
        assert.equal(actual.result.chain, 1);
      if (scenario.selector === "button" && !scenario.strict)
        assert.equal(actual.result.target.text, "Visible");
    }
  } finally {
    await browser.close();
  }
});
test("Playwright scope geometry, selector capture slicing and frame-action checks match original", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    async function run(scope: string, hidden: boolean) {
      const page = await browser.newPage();
      try {
        await page.setContent(
          '<iframe style="margin:10px;border:5px solid;width:200px;height:100px;transform:scale(1.5);transform-origin:top left" srcdoc="<button>Child</button>"></iframe>',
        );
        await page.frameLocator("iframe").locator("button").waitFor();
        await page.evaluate(original.vne);
        if (hidden)
          await page
            .locator("iframe")
            .evaluate((element: any) => (element.style.display = "none"));
        return await page.evaluate(
          `(()=>{${querySelectorWithVisibleFallbackSource}${scope}const frame=document.querySelector('iframe'),initial=window.__codexPlaywrightInjected;const slices=[undefined,0,1,2,3].map(capture=>sliceParsedSelector({parts:[1,2,3],capture},1,3));let error,geometry,size,point;try{size=frameContentSize(frame);geometry=frameContentGeometry(frame);point=prepareFrameChainForPointerAction([{element:frame,injected:initial}],{x:10,y:20});}catch(e){error=e.message}return {slices,error,geometry,size,point};})()`,
        );
      } finally {
        await page.close();
      }
    }
    for (const hidden of [false, true])
      assert.deepEqual(
        await run(selectorScopeFunctions(), hidden),
        await run(original.ig.selectorScopeFunctions(), hidden),
      );
  } finally {
    await browser.close();
  }
});

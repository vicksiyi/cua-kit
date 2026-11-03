import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { serviceExpression } from "./service-source";
import {
  hitTestElement,
  hitTestFrameOwner,
} from "../packages/browser/src/service/accessibility/hit_test";
const serialize = (fn: Function) =>
  `(function(){const __name=target=>target;return (${fn.toString()});})()`;
test("AX hit geometry matches original for clipping, occlusion, labels and composed trees", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 600, height: 400 },
    });
    const cases = [
      { html: '<button id="t">Button</button>' },
      {
        html: '<button id="t" style="position:absolute;left:-50px;width:100px">Clipped</button>',
      },
      {
        html: '<button id="t" style="position:absolute;top:900px">Offscreen</button>',
      },
      {
        html: '<button id="t">Button</button><div style="position:fixed;inset:0;background:white"></div>',
      },
      {
        html: '<div id="t" style="pointer-events:none;width:100px;height:100px">Pass through</div>',
      },
      {
        html: '<input id="t" type="checkbox" style="position:absolute;left:-100px"><label for="t">Visible label</label>',
        fallback: true,
      },
      { html: '<button><span id="t">Nested text</span></button>' },
      { html: '<button id="t"><input value="Different control"></button>' },
      {
        html: '<label><input type="checkbox"><span id="t">Label child</span></label>',
      },
      {
        html: '<div id="t">Text geometry</div>',
        setup: "target=target.firstChild",
      },
      {
        html: '<div id="host"></div>',
        setup:
          'const root=document.querySelector("#host").attachShadow({mode:"open"});root.innerHTML="<button id=t>Shadow</button>";target=root.querySelector("button")',
      },
      {
        html: '<div id="host"><button id="t">Slotted</button></div>',
        setup:
          'document.querySelector("#host").attachShadow({mode:"open"}).innerHTML="<slot></slot>"',
      },
      {
        html: '<div id="t">Detached text</div>',
        setup: "target=target.firstChild;target.remove()",
      },
    ];
    for (const scenario of cases) {
      async function run(fn: string) {
        await page.setContent(scenario.html);
        return page.evaluate(
          `(()=>{let target=document.querySelector('#t');${scenario.setup ?? ""};try{return {value:(${fn}).call(target)}}catch(e){return {error:e.message}}})()`,
        );
      }
      const actual: any = await run(serialize(hitTestElement));
      assert.deepEqual(
        actual,
        await run(serviceExpression("Mre")),
        scenario.html,
      );
      if (scenario.fallback) assert.ok(actual.value.fallbackPoint);
    }
  } finally {
    await browser.close();
  }
});
test("frame-owner coordinate mapping and occlusion match original in real DOM", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 600, height: 400 },
    });
    for (const covered of [false, true])
      for (const point of [
        { x: 50, y: 50 },
        { x: 150, y: 50 },
      ]) {
        await page.setContent(
          '<iframe id="t" style="position:absolute;left:40px;top:20px;width:200px;height:100px;border:0"></iframe>' +
            (covered
              ? '<div style="position:fixed;inset:0;background:white"></div>'
              : ""),
        );
        const argument = {
          bounds: { left: 0, top: 0, right: 100, bottom: 100 },
          point,
        };
        const run = (fn: string) =>
          page.evaluate(
            `(${fn}).call(document.querySelector('#t'),${JSON.stringify(argument)})`,
          );
        assert.deepEqual(
          await run(serialize(hitTestFrameOwner)),
          await run(serviceExpression("Ore")),
        );
      }
  } finally {
    await browser.close();
  }
});

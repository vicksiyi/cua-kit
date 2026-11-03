import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { serviceExpression } from "./service-source";
import {
  activateElement,
  scrollElementIntoView,
} from "../packages/browser/src/service/accessibility/activation";
import { callElementFunction } from "../packages/browser/src/service/accessibility/element_execution";

test("AX activation preserves native focus/click routing and failures in real Chromium", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const scenarios = [
      { html: '<input id="target">' },
      { html: '<textarea id="target"></textarea>' },
      { html: '<input id="target" readonly>' },
      { html: '<input id="target" disabled>' },
      { html: '<input id="target" type="checkbox">' },
      { html: '<button id="button"><span id="target">Click</span></button>' },
      {
        html: '<label id="target" for="input">Label</label><input id="input">',
      },
      {
        html: '<div contenteditable id="editor"><span id="target">Text</span></div>',
      },
      { html: '<div id="target" role="button" tabindex="0">Click</div>' },
      { html: '<svg><rect id="target" width="10" height="10" /></svg>' },
      { html: '<input id="target">', setup: "target.remove()" },
      { html: '<input id="target">', setup: "target.focus=()=>{}" },
      {
        html: '<button id="target">Text</button>',
        setup: "target=target.firstChild",
      },
      {
        html: '<div id="host"></div>',
        setup:
          'const root=document.querySelector("#host").attachShadow({mode:"open"});root.innerHTML="<input id=target>";target=root.querySelector("input")',
      },
    ];
    for (const scenario of scenarios) {
      async function run(fn: string) {
        await page.setContent(scenario.html);
        return page.evaluate(`(()=>{
     let target=document.querySelector('#target'); const trace=[];
     document.addEventListener('focus',e=>trace.push(['focus',e.target.id]),true);
     document.addEventListener('click',e=>trace.push(['click',e.target.id]),true);
     ${scenario.setup ?? ""};
     let error;try{(${fn}).call(target)}catch(e){error=e.message}
     return {error,trace,active:document.activeElement.id,checked:target.checked,shadowActive:target.getRootNode().activeElement?.id};
   })()`);
      }
      assert.deepEqual(
        await run(activateElement.toString()),
        await run(serviceExpression("Dre")),
        scenario.html,
      );
    }
  } finally {
    await browser.close();
  }
});

test("AX native scroll uses prototype and composes with remote CDP execution", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const session = await page.context().newCDPSession(page);
    async function run(fn: Function) {
      await page.setContent(
        '<div style="height:2000px"></div><input id="target"><div style="height:2000px"></div>',
      );
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        (document.querySelector("#target") as any).scrollIntoView = () => {
          throw Error("instance scroll must be bypassed");
        };
      });
      const handle = await session.send("Runtime.evaluate", {
        expression: 'document.querySelector("#target")',
      });
      const { node } = await session.send("DOM.describeNode", {
        objectId: handle.result.objectId!,
      });
      await session.send("Runtime.releaseObject", {
        objectId: handle.result.objectId!,
      });
      await callElementFunction(
        {
          cdp: {
            callTarget: (_target, method, params) =>
              session.send(method as any, params as any),
          },
        },
        { id: 1, target: { tabId: 1 }, backendNodeId: node.backendNodeId },
        fn as any,
        undefined,
      );
      return page.evaluate(() => ({
        scrollY,
        top: document.querySelector("#target")!.getBoundingClientRect().top,
        height: innerHeight,
      }));
    }
    const actual = await run(scrollElementIntoView);
    const expected = await run(
      new Function(`return (${serviceExpression("Bre")})`)(),
    );
    assert.deepEqual(actual, expected);
    assert.ok(actual.scrollY > 0);
    assert.ok(actual.top > 0 && actual.top < actual.height);
  } finally {
    await browser.close();
  }
});

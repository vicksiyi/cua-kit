import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { serviceExpression } from "./service-source";
import {
  selectElementText,
  optionActivationMode,
  activateSelectOption,
} from "../packages/browser/src/service/accessibility/selection";
const serialized = (fn: Function) =>
  `(function(){const __name=(target)=>target;return (${fn.toString()});})()`;

test("AX text selection matches original DOM ranges and errors in isolated Chromium", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const cases = [
      { html: '<input id="t" value="one two one">', text: "one" },
      {
        html: '<input id="t" value="one two one">',
        text: "one",
        prefix: "two ",
      },
      {
        html: '<input id="t" value="one two one">',
        text: "one",
        suffix: " two",
      },
      { html: '<textarea id="t">你好😀 world</textarea>', text: "😀" },
      {
        html: '<div id="t" contenteditable>first <b>second</b> third</div>',
        text: "st second th",
      },
      { html: '<div id="t">text node</div>', text: "node", textNode: true },
      { html: '<input id="t" disabled value="hello">', text: "hello" },
      { html: '<input id="t" readonly value="hello">', text: "hello" },
      { html: '<div id="t">hello</div>', text: "" },
      { html: '<div id="t">hello</div>', text: "missing" },
      { html: '<div id="t">hello</div>', text: "hello", detach: true },
      { html: '<input id="t" type="number" value="123">', text: "12" },
    ];
    for (const scenario of cases)
      for (const selectionType of ["text", "cursor_before", "cursor_after"]) {
        async function run(fn: string) {
          await page.setContent(scenario.html);
          return page.evaluate(`(() => {
          let target = document.querySelector('#t');
          if (${!!scenario.textNode}) target=target.firstChild;
          if (${!!scenario.detach}) target.remove();
          let error;
          try { (${fn}).call(target,${JSON.stringify({ ...scenario, selectionType })}); } catch(caught) {error=caught.message;}
          const selection = window.getSelection();
          return {error,start:target.selectionStart,end:target.selectionEnd,text:selection.toString(),anchorOffset:selection.anchorOffset,focusOffset:selection.focusOffset,anchor:selection.anchorNode?.textContent,focus:selection.focusNode?.textContent,active:document.activeElement.id};
        })()`);
        }
        assert.deepEqual(
          await run(serialized(selectElementText)),
          await run(serviceExpression("Nre")),
          JSON.stringify({ ...scenario, selectionType }),
        );
      }
  } finally {
    await browser.close();
  }
});

test("AX option routing and injected selection checks preserve original call order and failures", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const mode of [
      "normal",
      "multiple",
      "listbox",
      "detached",
      "orphan",
      "disabled",
      "notconnected",
      "helper-error",
      "open-closes",
      "open-stuck",
    ]) {
      async function run(route: string, activate: string) {
        await page.setContent(
          '<select id="select"><option>A</option><option id="option">B</option></select>',
        );
        return page.evaluate(`(() => {
          const select=document.querySelector('#select'), option=document.querySelector('#option'), mode=${JSON.stringify(mode)}, trace=[];
          if(mode==='multiple') select.multiple=true;
          if(mode==='listbox') select.size=3;
          if(mode==='detached') option.remove();
          if(mode==='orphan') document.body.append(option);
          if(mode.startsWith('open-')) {
            let open=true; const matches=select.matches.bind(select);
            select.matches=(selector)=>selector===':open'?open:matches(selector);
            select.blur=()=>{trace.push('blur'); if(mode==='open-closes') open=false};
          }
          const injected={elementState(element,state){trace.push(['state',element.id,state]);return {received:mode==='notconnected'?'error:notconnected':undefined,matches:mode!=='disabled'}},selectOptions(element,options){trace.push(['select',element.id,options.map(o=>o.id)]);return mode==='helper-error'?'error:fixture':['B']}};
          let routeResult,routeError,error;
          try {routeResult=(${route}).call(option)} catch(e){routeError=e.message}
          try {(${activate})(option,injected)} catch(e){error=e.message}
          return {routeResult,routeError,error,trace};
        })()`);
      }
      assert.deepEqual(
        await run(
          serialized(optionActivationMode),
          serialized(activateSelectOption),
        ),
        await run(serviceExpression("Fre"), serviceExpression("Lre")),
        mode,
      );
    }
  } finally {
    await browser.close();
  }
});

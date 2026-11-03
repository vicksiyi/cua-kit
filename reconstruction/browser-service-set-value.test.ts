import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { serviceExpression } from "./service-source";
import { setElementValue } from "../packages/browser/src/service/accessibility/set_value";

const source = serviceExpression("G2");
// tsx/esbuild may annotate named nested functions; this shim only preserves their function object.
const reconstructed = `(function(){const __name = (target) => target; return (${setElementValue.toString()});})()`;
interface Scenario {
  html: string;
  value: string;
  setup?: string;
}
const cases: Scenario[] = [
  { html: '<input id="target" value="old">', value: "你好😀" },
  { html: '<input id="target" value="same">', value: "same" },
  { html: '<textarea id="target">old</textarea>', value: "a\nb" },
  { html: '<input id="target" readonly>', value: "x" },
  { html: '<input id="target" disabled>', value: "x" },
  { html: '<input id="target" aria-disabled="true">', value: "x" },
  { html: '<input id="target" type="file">', value: "x" },
  { html: '<input id="target" type="color">', value: "#AABBCC" },
  { html: '<input id="target" type="color">', value: "red" },
  { html: '<input id="target" type="number" value="5">', value: "invalid" },
  { html: '<input id="target" type="checkbox">', value: "true" },
  { html: '<input id="target" type="checkbox" checked>', value: "true" },
  {
    html: '<input id="target" type="checkbox">',
    value: "false",
    setup: "target.indeterminate = true",
  },
  { html: '<input id="target" type="checkbox" role="switch">', value: "bad" },
  { html: '<input id="target" type="radio">', value: "1" },
  {
    html: '<select id="target"><option value="a">First</option><option value="b">Second</option></select>',
    value: "Second",
  },
  {
    html: '<select id="target"><option value="a">First</option><option value="b">Second</option></select>',
    value: "a",
  },
  {
    html: '<select id="target"><option value="a">Same</option><option value="b">Same</option></select>',
    value: "Same",
  },
  {
    html: '<select id="target"><option value="a">First</option></select>',
    value: "missing",
  },
  {
    html: '<select id="target"><option value="a">First</option><optgroup disabled><option value="b">Second</option></optgroup></select>',
    value: "b",
  },
  {
    html: '<select id="target" multiple><option>A</option></select>',
    value: "A",
  },
  {
    html: '<div id="target" role="tab" aria-selected="false"></div>',
    value: "1",
  },
  {
    html: '<div id="target" role="tab" aria-selected="true"></div>',
    value: "true",
  },
  { html: '<div id="target" role="tab"></div>', value: "false" },
  { html: '<div id="target" role="slider"></div>', value: "1" },
  { html: '<button id="target" aria-pressed="false"></button>', value: "true" },
  { html: '<div id="target" contenteditable>old</div>', value: "new" },
  { html: '<div id="target" contenteditable>same</div>', value: "same" },
  { html: '<div id="target"></div>', value: "x" },
  { html: '<input id="target">', value: "x", setup: "target.remove()" },
  {
    html: '<input id="target" type="checkbox">',
    value: "true",
    setup: 'target.addEventListener("input",()=>{target.checked=false})',
  },
  {
    html: '<input id="target" type="checkbox">',
    value: "true",
    setup: 'target.addEventListener("change",()=>target.remove())',
  },
  {
    html: '<select id="target"><option value="a">A</option><option value="b">B</option></select>',
    value: "b",
    setup: 'target.addEventListener("focus",()=>target.options[1].remove())',
  },
  {
    html: '<select id="target"><option value="a">A</option><option value="b">B</option></select>',
    value: "b",
    setup: 'target.addEventListener("input",()=>{target.value="a"})',
  },
  {
    html: '<input id="target">',
    value: "x",
    setup:
      'Object.defineProperty(target,"value",{set(){throw Error("instance setter invoked")},get(){return Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").get.call(this)}})',
  },
];

test("AX set-value matches original in real Chromium across control types, events, rejection and mutations", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    async function run(fn: string, scenario: Scenario) {
      await page.setContent(scenario.html);
      return page.evaluate(`(() => {
        const target = document.querySelector('#target');
        const events = [];
        for (const type of ['focus','input','change']) target.addEventListener(type, event => events.push({type,bubbles:event.bubbles,composed:event.composed,data:event.data ?? null,inputType:event.inputType ?? null}));
        ${scenario.setup ?? ""};
        let result, error;
        try { result = (${fn}).call(target, {value:${JSON.stringify(scenario.value)}}); } catch (caught) {error = caught.message;}
        return {result,error,events,value:target.value,checked:target.checked,indeterminate:target.indeterminate,text:target.textContent,connected:target.isConnected,selected:target.selectedIndex};
      })()`);
    }
    for (const [index, scenario] of cases.entries())
      assert.deepEqual(
        await run(reconstructed, scenario),
        await run(source, scenario),
        `scenario ${index}: ${scenario.html}`,
      );
    const rollback: any = await run(reconstructed, cases[9]);
    assert.equal(rollback.value, "5");
    assert.match(rollback.error, /rejected value/);
    const changed: any = await run(reconstructed, cases[0]);
    assert.deepEqual(
      changed.events.map((e: any) => e.type),
      ["focus", "input", "change"],
    );
  } finally {
    await browser.close();
  }
});

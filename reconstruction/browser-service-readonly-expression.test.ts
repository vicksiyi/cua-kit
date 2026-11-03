import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { originalServiceBindings } from "./service-source";
import {
  readonlyExpression,
  assertReadonlyScript,
} from "../packages/browser/src/service/readonly/expression";
import { isCredentialField } from "../packages/browser/src/service/clipboard/page_execution";
const original = originalServiceBindings([
  "uS",
  "kF",
  "qne",
  "One",
  "Mne",
  "Nne",
  "Fne",
  "no",
  "Ms",
]);
test("readonly expression preserves complete original page source with readable credential predicate", () => {
  for (const args of [
    ["return 1"],
    ["return element.id", "document.querySelector('button')"],
    [
      "return elements.length",
      undefined,
      "document.querySelectorAll('button')",
      "globalThis",
    ],
  ] as const) {
    const actual = readonlyExpression(
      ...(args as [string, string?, string?, string?]),
    );
    assert.equal(
      actual.replace(isCredentialField.toString(), original.Ms.toString()),
      original.uS(...args),
    );
  }
  for (const script of [
    "return import('x')",
    "return import /*comment*/ ('x')",
    "return import //comment\n ('x')",
    "return 'import(x)'",
    "return 1",
    "return importer('x')",
  ]) {
    function result(run: () => unknown) {
      try {
        run();
        return "accepted";
      } catch (e) {
        return (e as Error).message;
      }
    }
    assert.equal(
      result(() => assertReadonlyScript(script)),
      result(() => original.kF(script)),
      script,
    );
  }
});
test("readonly sandbox matches original DOM wrappers, restrictions, credentials and bounded result serialization", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const cases = [
      "return {title:document.title,text:document.querySelector('#item').textContent,count:document.querySelectorAll('button').length}",
      "return document.querySelector('#item')",
      "document.querySelector('#item').textContent='changed';return true",
      "return {fetch:typeof fetch,Function:typeof Function,process:typeof process,location:typeof location}",
      "return {constructor:(()=>{}).constructor,window:window===self}",
      "window.test=1;return window.test",
      "return {password:document.querySelector('#password').value,html:document.body.innerHTML,attributes:document.querySelector('#password').attributes}",
      "return {color:getComputedStyle(document.querySelector('#item')).color,rect:document.querySelector('#item').getBoundingClientRect()}",
      "return {rules:document.styleSheets[0].cssRules.length,rule:document.styleSheets[0].cssRules[0].cssText}",
      "document.querySelector('#item').style.color='blue';return true",
      "return {nan:NaN,infinity:Infinity,big:123n,fn:()=>1}",
      "const value={a:1};value.self=value;return value",
      "return Array.from({length:2100},(_,i)=>i)",
      "return 'x'.repeat(200010)",
      "return Object.fromEntries(Array.from({length:210},(_,i)=>['k'+i,i]))",
      "return {a:{b:{c:{d:{e:{f:{g:{h:{i:{j:1}}}}}}}}}}",
      "const range=document.createRange();range.selectNodeContents(document.querySelector('#item'));return range.toString()",
      "return element.id",
      "return elements.map(element=>element.id)",
    ];
    for (const script of cases) {
      async function run(restored: boolean) {
        const page = await browser.newPage();
        try {
          await page.setContent(
            "<title>Readonly</title><style>#item{color:rgb(255,0,0)}</style><div id=item>Hello</div><button id=one>One</button><button id=two>Two</button><input id=password type=password value=secret>",
          );
          const session = await page.context().newCDPSession(page),
            { frameTree } = await session.send("Page.getFrameTree"),
            { executionContextId } = await session.send(
              "Page.createIsolatedWorld",
              {
                frameId: frameTree.frame.id,
                worldName: "readonly-test",
                grantUniveralAccess: false,
              },
            );
          const args: [string, string?, string?] = [
            script,
            script.includes("return element.id")
              ? "rawDocument.querySelector('#item')"
              : undefined,
            script.includes("return elements.map")
              ? "rawDocument.querySelectorAll('button')"
              : undefined,
          ];
          const result = await session.send("Runtime.evaluate", {
            contextId: executionContextId,
            expression: restored
              ? readonlyExpression(...args)
              : original.uS(...args),
            awaitPromise: true,
            returnByValue: true,
          });
          const main = await page.evaluate(() => ({
            text: document.querySelector("#item")!.textContent,
            color: (document.querySelector("#item") as HTMLElement).style.color,
            fetch: typeof fetch,
            constructor: typeof Function.prototype.constructor,
          }));
          return {
            value: result.result.value,
            error:
              result.exceptionDetails?.exception?.description?.split("\n")[0],
            main,
          };
        } finally {
          await page.close();
        }
      }
      const actual = await run(true);
      assert.deepEqual(actual, await run(false), script);
      if (script === cases[0])
        assert.deepEqual(actual.value, {
          title: "Readonly",
          text: "Hello",
          count: 2,
        });
      if (script === cases[2] || script === cases[5] || script === cases[9])
        assert.ok(actual.error);
      if (script === cases[6]) {
        assert.equal(actual.error, undefined);
        assert.ok(!JSON.stringify(actual.value).includes("secret"));
      }
      if (script === cases[12]) assert.equal(actual.value.length, 2000);
      if (script === cases[13])
        assert.equal(actual.value.length, 200000 + "[Truncated]".length);
      if (script === cases[14])
        assert.equal(Object.keys(actual.value).length, 200);
      if (script === cases[17]) assert.equal(actual.value, "item");
      if (script === cases[18]) assert.deepEqual(actual.value, ["one", "two"]);
      assert.equal(actual.main.text, "Hello");
      assert.equal(actual.main.color, "");
      assert.equal(actual.main.fetch, "function");
      assert.equal(actual.main.constructor, "function");
    }
  } finally {
    await browser.close();
  }
});

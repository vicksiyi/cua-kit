import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { serviceExpression } from "./service-source";
import {
  pageClipboardOperation,
  commitClipboardCut,
} from "../packages/browser/src/service/clipboard/page_operations";
import { credentialFieldPolicy } from "../packages/browser/src/service/clipboard/page_execution";

test("clipboard page operations and two-phase cut match original in real Chromium", async () => {
  const browser = await chromium.launch({ headless: true });
  const plain = [
    {
      entries: [{ mime_type: "text/plain", text: "NEW" }],
      presentation_style: "unspecified",
    },
  ];
  const scenarios = [
    { action: "copy" },
    { action: "cut", commit: true },
    { action: "cut", commit: true, after: 'target.value="changed"' },
    { action: "cut", commit: true, setup: "target.readOnly=true" },
    {
      action: "cut",
      commit: true,
      setup: 'target.addEventListener("beforeinput",e=>e.preventDefault())',
    },
    { action: "cut", commit: true, wrongToken: true },
    { action: "cut", missingToken: true },
    { action: "copy", missingPolicy: true },
    { action: "copy", setup: 'target.type="password"' },
    { action: "copy", setup: "target.setSelectionRange(0,0)" },
    { action: "paste", items: plain },
    { action: "paste", items: [] },
    { action: "paste", items: plain, setup: "target.readOnly=true" },
    {
      action: "paste",
      items: plain,
      setup: 'target.addEventListener("paste",e=>e.preventDefault())',
    },
    { action: "paste", items: plain, setup: "window.DataTransfer=undefined" },
    { action: "paste", items: plain, token: "wrong" },
    {
      action: "paste",
      items: plain,
      token: "target",
      setup: 'target.__codexIabInputTargetToken="target"',
    },
    {
      action: "copy",
      setup: `target.addEventListener('copy',e=>{e.preventDefault();e.clipboardData.setData('text/html','<input type="password" value="secret"><input value="public">');e.clipboardData.setData('text/plain','custom')})`,
    },
    { action: "cut", commit: true, editor: true },
    { action: "copy", editor: true },
    { action: "paste", editor: true, items: plain },
    {
      action: "paste",
      editor: true,
      richTextFallback: true,
      items: [
        {
          entries: [{ mime_type: "text/html", text: "<b>NEW</b>" }],
          presentation_style: "unspecified",
        },
      ],
    },
    { action: "copy", shadow: true },
    { action: "paste", shadow: true, items: plain },
    { action: "cut", commit: true, invalidate: true },
  ];
  try {
    for (const scenario of scenarios) {
      async function run(operation: string, commit: string) {
        const page = await browser.newPage();
        try {
          await page.setContent(
            '<input id="target" value="abcdef"><div id="editor" contenteditable>ab<b>cd</b>ef</div><div id="host"></div>',
          );
          return await page.evaluate(`(async()=>{
            const __name=value=>value;
            const scenario=${JSON.stringify(scenario)};
            let target=document.querySelector(scenario.editor?'#editor':'#target');
            if(scenario.shadow){const root=document.querySelector('#host').attachShadow({mode:'open'});root.innerHTML='<input value="abcdef">';target=root.firstChild;}
            target.focus();
            if(scenario.editor){const range=document.createRange();range.selectNodeContents(target);getSelection().removeAllRanges();getSelection().addRange(range);}
            else target.setSelectionRange(1,4);
            const trace=[];
            for(const name of ['copy','cut','paste','beforeinput','input'])target.addEventListener(name,e=>trace.push({type:e.type,inputType:e.inputType}));
            ${scenario.setup ?? ""};
            const args={action:scenario.action,clipboardItems:scenario.items??[],protectedCredentialFieldPolicy:scenario.missingPolicy?undefined:${JSON.stringify(credentialFieldPolicy)},cutToken:scenario.missingToken?undefined:'cut-token',iabInputTargetToken:scenario.token,richTextFallback:scenario.richTextFallback};
            let result,error,commitError,repeatError;
            try{result=await (${operation})(args)}catch(e){error=e.message}
            const before=target.value??target.innerHTML;
            ${scenario.after ?? ""};
            if(scenario.invalidate)await (${operation})({...args,action:'copy'});
            if(scenario.commit){
              try{(${commit})({cutToken:scenario.wrongToken?'wrong':'cut-token'})}catch(e){commitError=e.message}
              try{(${commit})({cutToken:'cut-token'})}catch(e){repeatError=e.message}
            }
            return {result,error,before,after:target.value??target.innerHTML,commitError,repeatError,trace,pending:!!globalThis.__browserUsePendingCut};
          })()`);
        } finally {
          await page.close();
        }
      }
      const expected = await run(
        serviceExpression("Cp"),
        serviceExpression("KA"),
      );
      const actual = await run(
        pageClipboardOperation.toString(),
        commitClipboardCut.toString(),
      );
      assert.deepEqual(actual, expected, JSON.stringify(scenario));
      if (
        scenario.action === "cut" &&
        scenario.commit &&
        !scenario.after &&
        !scenario.setup &&
        !scenario.editor &&
        !scenario.wrongToken &&
        !scenario.invalidate
      ) {
        assert.equal(actual.before, "abcdef");
        assert.equal(actual.after, "aef");
        assert.equal(actual.pending, false);
      }
    }
  } finally {
    await browser.close();
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { extensionBindings } from "./extension-source";
import { compiledInjectedDeclarations } from "./injected-source";
const originals = extensionBindings(["Ny", "Uy", "$y", "Fy", "By"], {});
const originalSource =
  Object.entries(originals)
    .map(([name, fn]) => `const ${name}=${(fn as Function).toString()};`)
    .join("\n") +
  ";globalThis.api={has:Ny,bridge:Uy,install:$y,remove:Fy,removeBridge:By};";
const restoredSource =
  (await compiledInjectedDeclarations(
    "packages/browser-extension/dist/popup_dom.js",
  )) +
  ";globalThis.api={has:hasPopupInterceptor,bridge:installPopupBridge,install:installPopupInterceptor,remove:removePopupInterceptor,removeBridge:removePopupBridge};";
test("popup MAIN/isolated-world bridge matches original trusted resets, URL targets, return values and cleanup", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    async function run(source: string) {
      const page = await browser.newPage();
      await page.route("http://fixture.test/**", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: '<html><body><button id="reset">Reset</button><a id="link" target="_blank" href="/anchor">Open</a><iframe name="named" srcdoc=""></iframe></body></html>',
        }),
      );
      await page.goto("http://fixture.test/");
      const cdp = await page.context().newCDPSession(page);
      const { frameTree } = await cdp.send("Page.getFrameTree");
      const { executionContextId } = await cdp.send(
        "Page.createIsolatedWorld",
        { frameId: frameTree.frame.id, worldName: "popup-fixture" },
      );
      async function evaluate(expression: string, isolated = false) {
        const result = await cdp.send("Runtime.evaluate", {
          expression,
          ...(isolated ? { contextId: executionContextId } : {}),
          returnByValue: true,
          awaitPromise: true,
        });
        assert.equal(
          result.exceptionDetails,
          undefined,
          result.exceptionDetails?.text,
        );
        return result.result.value;
      }
      const key = "__codexAgentPopupInterceptor",
        event = "__codexAgentBackgroundPopupRequest",
        type = "CODEX_OPEN_AGENT_BACKGROUND_POPUP";
      await evaluate(
        `globalThis.active=true; Object.defineProperty(navigator,'userActivation',{configurable:true,get:()=>({isActive:active})}); globalThis.nativeCalls=[]; globalThis.nativeOpen=function(url,target,features){nativeCalls.push([String(url),target,features]);return {native:true};}; window.open=nativeOpen; ${source}`,
      );
      await evaluate(
        `globalThis.active=true; Object.defineProperty(navigator,'userActivation',{configurable:true,get:()=>({isActive:active})}); globalThis.messages=[]; globalThis.chrome={runtime:{sendMessage:(message)=>{messages.push(message);return Promise.resolve({ok:true});}}}; ${source}`,
        true,
      );
      await evaluate(
        `api.bridge(${JSON.stringify(key)},${JSON.stringify(event)},${JSON.stringify(type)})`,
        true,
      );
      await evaluate(
        `api.install(${JSON.stringify(key)},${JSON.stringify(event)})`,
      );
      const rows: any[] = [];
      const open = async (
        url: string,
        target = "_blank",
        features?: string,
      ) => {
        rows.push(
          await evaluate(
            `(()=>{const value=window.open(${JSON.stringify(url)},${JSON.stringify(target)},${features === undefined ? "undefined" : JSON.stringify(features)});return value==null?null:value.native?{native:true}:{closed:value.closed,focus:typeof value.focus};})()`,
          ),
        );
      };
      await open("/first");
      await open("/duplicate");
      await evaluate(
        "document.getElementById('reset').dispatchEvent(new MouseEvent('click',{bubbles:true}))",
      );
      await open("/after-synthetic");
      await page.locator("#reset").click();
      await open("/noopener", "_blank", "width=400, NoOpener = yes");
      await open("/self", "_SELF");
      await open("/named", "named");
      await open("", "_blank");
      await open("mailto:test@example.test");
      await evaluate("active=false");
      await evaluate("active=false", true);
      await open("/inactive");
      await evaluate("active=true");
      await evaluate("active=true", true);
      await page.locator("#reset").click();
      await open("/false-feature", "_blank", "noopener=0");
      await page.locator("#link").click(); // A real trusted anchor event resets bridge allowance and is intercepted.
      rows.push(
        await evaluate(`(()=>{const state=globalThis[${JSON.stringify(key)}]; const cases=[];
        for(const [href,target,download,button,prevented] of [['/a','',false,0,false],['/a','named',false,0,false],['/a','_blank',true,0,false],['https://elsewhere.test/a','_blank',true,0,false],['/a','_blank',false,1,false],['/a','_blank',false,0,true]]){
          const anchor=document.createElement('a');anchor.href=href;anchor.target=target;if(download)anchor.setAttribute('download','');
          const event={button,defaultPrevented:prevented,composedPath:()=>[anchor],preventDefault(){this.defaultPrevented=true;}};state.clickListener(event);cases.push(event.defaultPrevented);
        }return cases;})()`),
      );
      const messages = await evaluate("messages", true),
        nativeCalls = await evaluate("nativeCalls");
      await evaluate(`api.remove(${JSON.stringify(key)})`);
      await evaluate(`api.removeBridge(${JSON.stringify(key)})`, true);
      const restored = await evaluate(
          `window.open===nativeOpen && !api.has(${JSON.stringify(key)})`,
        ),
        bridgeRemoved = await evaluate(
          `!api.has(${JSON.stringify(key)})`,
          true,
        );
      await evaluate(
        `api.install(${JSON.stringify(key)},${JSON.stringify(event)});globalThis.siteOpen=()=>null;window.open=siteOpen;api.remove(${JSON.stringify(key)})`,
      );
      const sitePreserved = await evaluate("window.open===siteOpen");
      const pageCount = page.context().pages().length;
      await page.close();
      return {
        rows,
        messages,
        nativeCalls,
        restored,
        bridgeRemoved,
        sitePreserved,
        pageCount,
      };
    }
    const actual = await run(restoredSource);
    assert.deepEqual(actual, await run(originalSource));
    assert.deepEqual(actual.rows.slice(0, 4), [
      { closed: false, focus: "function" },
      null,
      null,
      null,
    ]);
    assert.deepEqual(
      actual.messages.map((message: any) => message.url),
      [
        "http://fixture.test/first",
        "http://fixture.test/noopener",
        "http://fixture.test/false-feature",
        "http://fixture.test/anchor",
      ],
    );
    assert.equal(actual.restored, true);
    assert.equal(actual.bridgeRemoved, true);
    assert.equal(actual.sitePreserved, true);
    assert.equal(actual.pageCount, 1);
  } finally {
    await browser.close();
  }
});

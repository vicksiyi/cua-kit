import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import {
  injectedExpression,
  compiledInjectedDeclarations,
} from "./injected-source";
const actual =
  (await compiledInjectedDeclarations(
    "packages/browser/dist/service/playwright/injected/dom_visibility.js",
  )) +
  `\nreturn {configure:setBrowserWorkarounds, contains:containsAcrossShadowRoots,parent:parentElementOrShadowHost,host:enclosingShadowHost,closest:closestAcrossShadowRoots,style:computedStyle,styleVisible:isStyleVisible,visibility:elementVisibility,visible:isElementVisible,textVisible:isTextNodeVisible,tag:safeElementTagName,begin:beginStyleCaches,end:endStyleCaches};`;
const original = `let Tr={}, Ee, Se, _e, Ir=0; ${["xi", "St", "$", "kr", "ye", "X", "Cr", "Ze", "Q", "Nr", "_", "_t", "Tt"].map((name) => `const ${name} = ${injectedExpression(name)};`).join("\n")} return {configure:xi,contains:St,parent:$,host:kr,closest:ye,style:X,styleVisible:Cr,visibility:Ze,visible:Q,textVisible:Nr,tag:_,begin:_t,end:Tt};`;

test("injected visibility and shadow traversal preserve original Chromium geometry and workaround branches", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>.hidden{visibility:hidden}.none{display:none}.contents{display:contents}.zero{width:0;height:0;overflow:hidden}</style>
      <div id="outer"><div id="scope"><span id="visible">Visible</span><span id="empty"></span><div id="host"></div></div></div>
      <div id="hidden" class="hidden">Hidden</div><div id="none" class="none">None</div><div id="zero" class="zero">Zero</div>
      <div id="transparent" style="opacity:0">Transparent</div><div id="offscreen" style="position:absolute;left:-10000px">Offscreen</div>
      <div id="textContents" class="contents">Text</div><div id="elementContents" class="contents"><b>Bold</b></div><div id="emptyContents" class="contents"></div>
      <details id="details"><summary id="summary">Summary</summary><span id="collapsed">Collapsed</span></details>
      <form id="form"><input name="tagName"></form>`);
    await page.evaluate(() => {
      const root = document
        .getElementById("host")!
        .attachShadow({ mode: "open" });
      root.innerHTML = '<div id="innerHost"></div>';
      root
        .querySelector("#innerHost")!
        .attachShadow({ mode: "open" }).innerHTML =
        '<span id="leaf">Leaf</span>';
    });
    for (const browserNameForWorkarounds of ["chromium", "webkit"]) {
      const observe = (source: string) =>
        page.evaluate(
          ({ source, browserNameForWorkarounds }) => {
            const api = new Function(source)();
            api.configure({ browserNameForWorkarounds });
            const ids = [
              "visible",
              "empty",
              "hidden",
              "none",
              "zero",
              "transparent",
              "offscreen",
              "textContents",
              "elementContents",
              "emptyContents",
              "details",
              "summary",
              "collapsed",
            ];
            const visibility = Object.fromEntries(
              ids.map((id) => [
                id,
                api.visibility(document.getElementById(id)),
              ]),
            );
            const host = document.getElementById("host")!,
              inner = host.shadowRoot!.querySelector("#innerHost")!,
              leaf = inner.shadowRoot!.querySelector("#leaf")!;
            const outer = document.getElementById("outer")!,
              scope = document.getElementById("scope")!;
            const traversal = {
              contains: api.contains(outer, leaf),
              reverse: api.contains(leaf, outer),
              parent: api.parent(leaf)?.id,
              host: api.host(leaf)?.id,
              closest: api.closest(leaf, "#outer")?.id,
              scoped: api.closest(leaf, "#outer", scope)?.id,
              scopeMatch: api.closest(leaf, "#scope", scope)?.id,
            };
            const detached = document.implementation
              .createHTMLDocument("")
              .createElement("div");
            const withoutView = api.visibility(detached);
            const formTag = api.tag(document.getElementById("form"));
            const textVisible = api.textVisible(
              document.getElementById("textContents")!.firstChild,
            );
            return { visibility, traversal, withoutView, formTag, textVisible };
          },
          { source, browserNameForWorkarounds },
        );
      const restored = await observe(actual);
      assert.deepEqual(restored, await observe(original));
      assert.equal(restored.visibility.hidden.visible, false);
      assert.equal(restored.visibility.zero.visible, false);
      assert.equal(restored.visibility.transparent.visible, true);
      assert.equal(restored.visibility.offscreen.visible, true);
      assert.equal(restored.visibility.collapsed.visible, false);
      assert.equal(restored.visibility.summary.visible, true);
      assert.equal(restored.visibility.textContents.inline, true);
      assert.equal(restored.visibility.elementContents.inline, false);
      assert.deepEqual(restored.withoutView, { visible: true, inline: false });
      assert.deepEqual(restored.traversal, {
        contains: true,
        reverse: false,
        parent: "innerHost",
        host: "innerHost",
        closest: "outer",
        scoped: undefined,
        scopeMatch: "scope",
      });
      assert.equal(restored.formTag, "FORM");
      assert(restored.textVisible);
    }
  } finally {
    await browser.close();
  }
});
test("nested style caches preserve original pseudo separation, undefined memoization and final release", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="target">Target</div>');
    const observe = (source: string) =>
      page.evaluate((source) => {
        const api = new Function(source)(),
          element = document.getElementById("target")!;
        const originalStyle = window.getComputedStyle;
        let calls = 0;
        window.getComputedStyle = function (element, pseudo) {
          calls++;
          return originalStyle.call(this, element, pseudo);
        };
        try {
          api.begin();
          api.begin();
          const normal = api.style(element),
            before = api.style(element, "::before"),
            after = api.style(element, "::after");
          const identity = [
            api.style(element) === normal,
            api.style(element, "::before") === before,
            api.style(element, "::after") === after,
          ];
          const afterReads = calls;
          api.end();
          api.style(element);
          const afterNestedEnd = calls;
          api.end();
          api.style(element);
          const afterFinalEnd = calls;
          api.begin();
          api.style(element);
          api.end();
          const afterRestart = calls;
          // An undefined style is memoized with has(), even when a document later gets a view.
          const missingView = document.implementation.createHTMLDocument("");
          const detached = missingView.createElement("div");
          api.begin();
          const absent = api.style(detached);
          document.adoptNode(detached);
          const stillAbsent = api.style(detached);
          api.end();
          const available = api.style(detached);
          return {
            identity,
            afterReads,
            afterNestedEnd,
            afterFinalEnd,
            afterRestart,
            absent: absent === undefined,
            stillAbsent: stillAbsent === undefined,
            available: available !== undefined,
          };
        } finally {
          window.getComputedStyle = originalStyle;
        }
      }, source);
    const restored = await observe(actual);
    assert.deepEqual(restored, await observe(original));
    assert.deepEqual(restored, {
      identity: [true, true, true],
      afterReads: 3,
      afterNestedEnd: 3,
      afterFinalEnd: 4,
      afterRestart: 5,
      absent: true,
      stillAbsent: true,
      available: true,
    });
  } finally {
    await browser.close();
  }
});

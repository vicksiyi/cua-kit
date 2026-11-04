import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { parse } from "acorn";
import { chromium } from "playwright";
import { injectedExpression } from "./injected-source";

async function declarations(path: string) {
  let source = await readFile(path, "utf8");
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  const edits: { start: number; end: number }[] = [];
  for (const node of ast.body) {
    if (node.type === "ImportDeclaration")
      edits.push({ start: node.start, end: node.end });
    if (node.type === "ExportNamedDeclaration" && node.declaration)
      edits.push({ start: node.start, end: node.declaration.start });
  }
  for (const edit of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + source.slice(edit.end);
  return source;
}
const actual =
  (await declarations(
    "packages/browser/dist/service/playwright/injected/text_matcher.js",
  )) +
  "\n" +
  (await declarations(
    "packages/browser/dist/service/playwright/injected/dom_text.js",
  )) +
  "\nreturn {text:elementText, match:elementMatchesText, labels:elementLabels, refs:referencedElements, root:enclosingQueryRoot, matcher:createTextMatcher};";
const original = `let we; ${["O", "ro", "ht", "qt", "q", "st", "Ar", "le", "Wr", "dn"].map((name) => `const ${name} = ${injectedExpression(name)};`).join("\n")} return {text:q, match:st, labels:dn, refs:le, root:Ar, matcher:ht};`;

test("injected DOM text and labels match original on real Chromium including shadow roots and cache invalidation", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<head><title>Hidden head</title></head><body>
      <div id="mixed">Alpha<!--ignored--> Beta<span>Child</span> Tail<style>.x{color:red}</style><script type="text/plain">script ignored</script><noscript>noscript ignored</noscript></div>
      <div id="whitespace">  Hello\n\t world\u200b\u00ad </div>
      <input id="submit" type="submit" value="Send  now"><input id="button" type="button" value="Press"><input id="plain" value="not text"><input id="hidden" type="hidden" value="secret">
      <label for="labelled">Native Label</label><input id="labelled"><label id="first">First</label><label id="second">Second</label>
      <input id="referenced" aria-labelledby="second first second missing" aria-label="fallback">
      <input id="fallback" aria-labelledby="missing" aria-label="  ARIA  label  ">
      <input id="blank" aria-label="  "><div id="shadow">Light</div><div id="empty"></div>
      <div id="tabref" aria-labelledby="first&#9;second" aria-label="tab fallback"></div>
    </body>`);
    await page.evaluate(() => {
      document
        .querySelector("#shadow")!
        .attachShadow({ mode: "open" }).innerHTML =
        '<span id="first">Shadow text</span><input id="control" aria-labelledby="first">';
    });
    async function observe(source: string) {
      return page.evaluate((source) => {
        const api = new Function(source)();
        const cache = new Map();
        const ids = [
          "mixed",
          "whitespace",
          "submit",
          "button",
          "plain",
          "hidden",
          "labelled",
          "referenced",
          "fallback",
          "blank",
          "shadow",
          "empty",
          "tabref",
        ];
        const snapshots = ids.map((id) => {
          const element = document.getElementById(id)!;
          const text = api.text(cache, element);
          const matches = [
            "",
            "Child",
            '"Child"',
            '"Alpha Beta"',
            "Shadow text",
            "/child/i",
          ].map((selector) => {
            const matcher = api.matcher(selector, false);
            return [selector, api.match(cache, element, matcher.matcher)];
          });
          return { id, text, labels: api.labels(cache, element), matches };
        });
        const head = api.text(cache, document.head);
        const shadow = document.getElementById("shadow")!.shadowRoot!;
        const control = shadow.querySelector("#control")!;
        const shadowLabels = api.labels(cache, control);
        const referenceOrder = api
          .refs(document.getElementById("referenced"), "second first second")
          .map((node: Element) => node.id);
        const isolated = document.createElement("div");
        const detachedRoot = api.root(isolated) === undefined;
        const fragment = document.createDocumentFragment();
        fragment.append(isolated);
        const fragmentRoot = api.root(isolated) === fragment;
        const changed = document.getElementById("whitespace")!;
        const previous = api.text(cache, changed);
        changed.textContent = "Updated";
        const reusedIdentity = api.text(cache, changed) === previous;
        const cached = api.text(cache, changed).full;
        cache.clear();
        const refreshed = api.text(cache, changed).full;
        changed.textContent = "  Hello\n\t world\u200b\u00ad ";
        return {
          snapshots,
          head,
          shadowLabels,
          referenceOrder,
          detachedRoot,
          fragmentRoot,
          reusedIdentity,
          cached,
          refreshed,
        };
      }, source);
    }
    const expected = await observe(original),
      restored = await observe(actual);
    assert.deepEqual(restored, expected);
    const byId = Object.fromEntries(
      restored.snapshots.map((entry: any) => [entry.id, entry]),
    );
    assert.equal(byId.mixed.text.full, "Alpha BetaChild Tail");
    assert.deepEqual(byId.mixed.text.immediate, ["Alpha Beta", " Tail"]);
    assert.equal(byId.plain.text.full, "");
    assert.equal(byId.submit.text.full, "Send  now");
    assert.equal(byId.shadow.text.full, "LightShadow text");
    assert.deepEqual(restored.referenceOrder, ["second", "first"]);
    assert.equal(restored.shadowLabels[0].full, "Shadow text");
    assert.equal(byId.tabref.labels[0].full, "tab fallback");
    assert.equal(byId.labelled.labels[0].full, "Native Label");
    assert.equal(
      byId.mixed.matches.find((value: any) => value[0] === "Child")[1],
      "selfAndChildren",
    );
    assert.equal(
      byId.mixed.matches.find((value: any) => value[0] === '"Alpha Beta"')[1],
      "self",
    );
    assert(
      restored.reusedIdentity && restored.detachedRoot && restored.fragmentRoot,
    );
    assert.equal(restored.refreshed, "Updated");
    assert.equal(restored.head.full, "");
  } finally {
    await browser.close();
  }
});

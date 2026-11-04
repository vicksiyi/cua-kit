import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";
import { extensionBindings } from "./extension-source";
import { captureTabContext } from "../packages/browser-extension/src/tab_capture";
const original = extensionBindings(["al", "dg"], { kp: 4096 });

test("isolated page capture matches original DOM serialization, redaction and budgets in Chromium", async () => {
  const built = await build({
    entryPoints: ["packages/browser-extension/src/tab_capture.ts"],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "TabCapture",
    platform: "browser",
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    // tsx names closures inside the test harness; the injected production bundle itself has no such dependency.
    assert.ok(!built.outputFiles[0].text.includes("__name"));
    await page.addInitScript("globalThis.__name = value => value");
    await page.route("https://capture.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<title>Capture &amp; title</title><body>
      <div> Alpha <span> beta </span> gamma &lt;&amp;&gt; </div><p>next<br>line</p>
      <pre> a  b\n c </pre><code> code  text </code><div style="white-space:pre-wrap"> wrapped  text </div>
      <a href="#here">same page</a><a href="/other?a=1&amp;b=2" aria-label="quoted &quot;">other</a>
      <button name="go" title="Now"> go </button>
      <input id="edit" value="ab&lt;&amp;cd"><input type="password" value="fixture-secret">
      <input value="123-456"><input value="123abc"><input value="12345678901234567890123456789012">
      <input type="checkbox" checked><input type="radio"><textarea>line  one\nline two</textarea>
      <select><option value="a"> A </option><option value="b" selected>B &amp; C</option></select>
      <img src="data:image/png;base64," alt="ALT"><img src="/image.png" alt="X">
      <table><tr><td> cell </td><th contenteditable="plaintext-only"> edit </th></tr></table>
      <div contenteditable="true"> editable </div><div id="shadow">light</div>
      <div style="display:none">hidden original behavior</div><svg><title>SVG title</title><text>svg</text></svg>
      <script>ignored script text</script><style>.unused{color:red}</style>
    </body>`,
      }),
    );
    await page.goto("https://capture.test/page");
    await page.addScriptTag({ content: built.outputFiles[0].text });
    await page.addScriptTag({
      content: `globalThis.originalCapture=${original.al.toString()};`,
    });
    await page.evaluate(
      () =>
        (document
          .querySelector("#shadow")!
          .attachShadow({ mode: "open" }).innerHTML =
          '<span>shadow 🧪</span><input value="321">'),
    );
    for (const focus of ["none", "cursor", "selection", "textarea"]) {
      await page.evaluate((focus) => {
        (document.activeElement as HTMLElement)?.blur();
        if (focus === "none") return;
        const el = document.querySelector(
          focus === "textarea" ? "textarea" : "#edit",
        ) as HTMLInputElement;
        el.focus();
        el.setSelectionRange(1, focus === "cursor" ? 1 : 4);
      }, focus);
      const cases: any[] = [
        ["https://capture.test/changed", null, null],
        [null, null, null],
        ["https://capture.test/page", null, null],
      ];
      for (const length of [0, 1, 7, 20, 100, 80000])
        for (const depth of [0, 2, 128])
          cases.push([
            null,
            length,
            length,
            { maxNodes: 10000, maxDepth: depth, maxTitleLength: 8 },
          ]);
      for (const nodes of [0, 1, 5, 10, 20])
        cases.push([
          null,
          80000,
          80000,
          { maxNodes: nodes, maxDepth: 128, maxTitleLength: 4096 },
        ]);
      for (const args of cases) {
        const result = await page.evaluate((args) => {
          const run = (fn: any) => {
            try {
              return { value: fn(...args) };
            } catch (error: any) {
              return { name: error.name, message: error.message };
            }
          };
          return [
            run((globalThis as any).originalCapture),
            run((globalThis as any).TabCapture.captureTabPage),
          ];
        }, args);
        assert.deepEqual(
          result[1],
          result[0],
          `${focus}:${JSON.stringify(args)}`,
        );
        if (result[1].value)
          assert.ok(!result[1].value.text.includes("fixture-secret"));
      }
    }
  } finally {
    await browser.close();
  }
});

test("tab context wrapper preserves original capture arguments and result validation", async () => {
  for (const value of [
    null,
    7,
    {},
    { url: "u", title: "t", text: "x", truncated: false, extra: 1 },
    { url: "u", title: "x".repeat(4097), text: "", truncated: false },
    { url: "u", title: "", text: "x".repeat(80001), truncated: false },
    { url: "u", title: "", text: "", truncated: 0 },
  ]) {
    const outputs = [];
    for (const restored of [false, true]) {
      let args: unknown;
      const execute = async (_fn: any, parameters: any, world: any) => {
        args = { parameters, world };
        return value;
      };
      try {
        outputs.push({
          value: await (restored ? captureTabContext : original.dg)(execute),
          args,
        });
      } catch (error: any) {
        outputs.push({ error: error.message, args });
      }
    }
    assert.deepEqual(outputs[1], outputs[0]);
  }
});

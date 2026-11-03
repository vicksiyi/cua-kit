import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import { authSelectors } from "../packages/browser/src/service/browser_auth/bindings";
import { readAuthSubmissionOrigin } from "../packages/browser/src/service/browser_auth/submission_origin";
import {
  readAuthActionTargets,
  authTargetsInSnapshotRoot,
  readAuthActionTarget,
} from "../packages/browser/src/service/browser_auth/action_review";
const original = originalServiceBindings(["dc", "xY", "PD", "pc"], {
  _f: authSelectors,
  SY: " >> internal:control=enter-frame >> ",
  vf: readAuthSubmissionOrigin,
});
test("action review matches original gate, origin, option order and failure boundaries", async () => {
  async function run(source: boolean, mode: string) {
    const trace: any[] = [];
    const request: any = {
      tab_id: "7",
      timeout_ms: 123,
      fields: [
        {
          selector:
            mode === "nested"
              ? "iframe >> internal:control=enter-frame >> #field"
              : "#field",
        },
      ],
      options: [
        { id: "skip" },
        { id: "a", selector: "#a" },
        { id: "b", selector: "#b" },
      ],
      submit: { selector: "#submit", action: "click" },
    };
    if (mode === "no-submit") delete request.submit;
    const context: any = {
      playwright: {
        async evaluateOnPlaywrightSelector(
          tab: string,
          selector: string,
          callback: Function,
          options: any,
        ) {
          trace.push([tab, selector, options]);
          const operation = options.arg.operation;
          if (operation === "browser-auth-snapshot-root") {
            if (mode === "root-error") throw new Error("root");
            return mode !== "outside";
          }
          if (operation === "browser-auth-submission-origin") {
            if (mode === "submission-error") throw new Error("origin");
            return mode === "unknown-origin"
              ? undefined
              : mode === "no-form"
                ? null
                : {
                    origin: "https://form.test",
                    url: "https://form.test/post",
                  };
          }
          if (
            (mode === "option-error" && selector === "#a") ||
            (mode === "submit-error" && selector === "#submit")
          )
            throw new Error("target");
          return { accessible_name: selector, origin: "https://form.test" };
        },
      },
    };
    return {
      result: await (source ? original.dc : readAuthActionTargets)(
        request,
        context,
      ),
      trace,
    };
  }
  for (const mode of [
    "normal",
    "nested",
    "no-submit",
    "root-error",
    "outside",
    "submission-error",
    "unknown-origin",
    "no-form",
    "option-error",
    "submit-error",
  ])
    assert.deepEqual(await run(false, mode), await run(true, mode), mode);
  assert.equal((await run(false, "outside")).result, null);
  assert.equal((await run(false, "no-form")).result.submissionOrigin, null);
});
test("action review callbacks match original in Chromium including shadow and detached roots", async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://form.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<form method="post" action="/post"><input id="field"><button id="submit">Submit</button></form><div id="host"></div>',
      }),
    );
    await page.goto("https://form.test/");
    await page.evaluate(() => {
      const host = document.querySelector("#host")!;
      host.attachShadow({ mode: "open" }).innerHTML =
        '<button id="shadow">Shadow</button>';
      const detached = document.createElement("button");
      (window as any).detached = detached;
      const detachedHost = document.createElement("div");
      detachedHost.attachShadow({ mode: "open" }).innerHTML =
        "<button>Detached shadow</button>";
      (window as any).detachedShadow =
        detachedHost.shadowRoot!.firstElementChild;
    });
    const context: any = {
      playwright: {
        async evaluateOnPlaywrightSelector(
          _tab: string,
          selector: string,
          callback: Function,
          options: any,
        ) {
          return page.evaluate(
            ({ selector, script, arg }) => {
              const element =
                selector === "detached"
                  ? (window as any).detached
                  : selector === "detachedShadow"
                    ? (window as any).detachedShadow
                    : selector === "shadow"
                      ? document.querySelector("#host")!.shadowRoot!
                          .firstElementChild
                      : document.querySelector(selector);
              const injected = {
                utils: {
                  getElementAccessibleName(el: Element) {
                    return el.getAttribute("data-name") ?? el.textContent ?? "";
                  },
                },
              };
              return (0, eval)(`(${script})`)(element, injected, arg);
            },
            { selector, script: callback.toString(), arg: options.arg },
          );
        },
      },
    };
    for (const selector of [
      "#field",
      "shadow",
      "detached",
      "detachedShadow",
      "head",
      "#missing",
    ]) {
      const request: any = { tab_id: "7", fields: [{ selector }] };
      const actual = await authTargetsInSnapshotRoot(request, context);
      assert.equal(actual, await original.xY(request, context), selector);
      assert.equal(actual, selector === "#field" || selector === "shadow");
    }
    const request: any = {
      tab_id: "7",
      fields: [{ selector: "#field" }],
      submit: { selector: "#submit", action: "click" },
    };
    for (const name of [
      "",
      "  hello\n world  ",
      "a".repeat(80),
      "b".repeat(81),
    ]) {
      await page
        .locator("#submit")
        .evaluate(
          (element, name) => element.setAttribute("data-name", name),
          name,
        );
      assert.deepEqual(
        await readAuthActionTarget("#submit", request, context),
        await original.PD("#submit", request, context),
      );
    }
    const actual = await readAuthActionTargets(request, context);
    assert.deepEqual(actual, await original.dc(request, context));
    assert.equal(actual!.submissionOrigin, "https://form.test");
  } finally {
    await browser.close();
  }
});

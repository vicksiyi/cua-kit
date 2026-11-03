import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings, serviceExpression } from "./service-source";
import * as inspection from "../packages/browser/src/service/browser_auth/field_inspection";
import { authFieldPage } from "../packages/browser/src/service/browser_auth/field_page";
import { distinctAuthElements } from "../packages/browser/src/service/browser_auth/bindings";
const old = originalServiceBindings(
  ["oN", "rte", "nte", "vv", "Ah", "Ph", "QM", "tte", "za"],
  { Y_: authFieldPage, _v: distinctAuthElements },
);
async function run(source: boolean, mode: string) {
  const trace: any[] = [];
  const request: any = {
    browser_id: "b",
    tab_id: "7",
    timeout_ms: 12,
    fields: [
      { id: "a", selector: "#a", type: "text", required: false },
      { id: "b", selector: "#b", type: "password", required: true },
    ],
    options: [{ id: "opt", selector: "#opt" }],
    submit: {
      selector: "#submit",
      action: mode === "enter" ? "press_enter" : "click",
    },
  };
  const context: any = {
    playwright: {
      async evaluateOnPlaywrightSelector(
        tab: string,
        selector: string,
        callback: Function,
        options: any,
      ) {
        trace.push(["evaluate", tab, selector, options]);
        if (mode === "error") throw new Error("fixture");
        if (options.arg.operation === "browser-auth-user-visibility")
          return mode === "false" ? false : mode === "null" ? null : true;
        const element = {
          tagName: mode === "wrong-tag" ? "DIV" : "INPUT",
          type: mode === "wrong-type" ? "email" : options.arg.expectedType,
          autocomplete: "ONE-TIME-CODE",
          inputMode: "NUMERIC",
          name: "  field  name  ",
          required: true,
        };
        return callback(
          element,
          {
            utils: {
              getElementAccessibleName() {
                return mode === "long-label" ? "x".repeat(81) : "  A \n B  ";
              },
            },
          },
          options.arg,
        );
      },
      async countLocator(payload: any) {
        trace.push(["count", payload.selector]);
        return mode === "count" ? 2 : 1;
      },
      async readElementState(payload: any, state: string) {
        trace.push(["state", payload.selector, state]);
        return (
          !(mode === "disabled" && state === "enabled") &&
          !(mode === "hidden" && state === "visible")
        );
      },
      async selectorsResolveToDistinctElements(
        tab: string,
        selectors: string[],
      ) {
        trace.push(["distinct", tab, selectors]);
        return mode !== "duplicate";
      },
    },
  };
  const api = source
    ? [old.nte, old.QM, old.za]
    : [
        inspection.firstInvisibleAuthField,
        inspection.revalidateAuthLocators,
        inspection.inspectAuthFields,
      ];
  const result = [
    await api[0](request, context),
    await api[1](request, context),
    await api[2](request, context),
    await api[2](request, context, true, true),
  ];
  return { result, trace };
}
test("auth inspection matches original visibility tri-state, strict validation and metadata ordering", async () => {
  for (const mode of [
    "normal",
    "enter",
    "false",
    "null",
    "error",
    "wrong-tag",
    "wrong-type",
    "long-label",
    "count",
    "disabled",
    "hidden",
    "duplicate",
  ])
    assert.deepEqual(await run(false, mode), await run(true, mode), mode);
});
test("auth field page callback matches original in Chromium for visibility, fill and native form guards", async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://auth-field.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<form method="post" action="/submit"><label for="field">Visible label</label><input id="field"><div><span aria-hidden="true">1</span><span aria-hidden="true">2</span><span aria-hidden="true">3</span><span aria-hidden="true">4</span></div><button id="submit">Submit</button></form>',
      }),
    );
    async function execute(source: string, mode: string) {
      await page.goto("https://auth-field.test/");
      return await page.evaluate(
        ({ source, mode }) => {
          const input = document.querySelector("input")!,
            events: any[] = [];
          const callback = (0, eval)(`(${source})`);
          const otp = mode === "otp" || mode === "otp-cancel";
          if (otp) {
            input.autocomplete = "one-time-code";
            input.maxLength = 4;
            input.style.cssText =
              "width:0;height:0;padding:0;border:0;position:absolute";
            input.focus();
          }
          if (mode === "opacity") input.style.opacity = "0";
          if (mode === "wrong-type") input.type = "password";
          if (mode === "get") input.form!.method = "get";
          if (mode === "cross-origin")
            input.form!.action = "https://other.test/submit";
          input.addEventListener("paste", (event) => {
            events.push([
              "paste",
              (event as ClipboardEvent).clipboardData?.getData("text/plain"),
            ]);
            if (mode === "otp-cancel") event.preventDefault();
          });
          input.addEventListener("input", (event) =>
            events.push([
              "input",
              (event as InputEvent).inputType,
              (event as InputEvent).data,
            ]),
          );
          const injected = {
            elementState(element: Element, state: string) {
              return {
                matches:
                  element === input
                    ? state === "visible"
                      ? !otp && mode !== "hidden"
                      : state === "enabled"
                        ? mode !== "disabled"
                        : mode !== "readonly"
                    : true,
              };
            },
            retarget(element: Element) {
              return mode === "not-input" ? document.body : element;
            },
            parseSelector(selector: string) {
              return selector;
            },
            querySelectorAll(selector: string, root: Element) {
              return root.querySelectorAll(selector);
            },
            fill(element: HTMLInputElement) {
              events.push(["fill"]);
              if (mode === "detached") element.remove();
              return mode === "done"
                ? "done"
                : mode === "fill-error"
                  ? "fill failed"
                  : "needsinput";
            },
          };
          let result, error;
          try {
            result = callback(input, injected, {
              operation:
                mode.startsWith("probe") ||
                mode === "opacity" ||
                mode === "wrong-type"
                  ? "browser-auth-user-visibility"
                  : "fill",
              expectedType: mode === "probe-wrong" ? "password" : "text",
              value: "1234",
              ...(["get", "cross-origin", "native"].includes(mode)
                ? { nativeSubmitSelector: "#submit" }
                : {}),
            });
          } catch (caught) {
            error = (caught as Error).message;
          }
          return { result, error, events, value: input.value };
        },
        { source, mode },
      );
    }
    for (const mode of [
      "probe",
      "probe-wrong",
      "opacity",
      "wrong-type",
      "normal",
      "done",
      "fill-error",
      "detached",
      "hidden",
      "disabled",
      "readonly",
      "not-input",
      "native",
      "get",
      "cross-origin",
      "otp",
      "otp-cancel",
    ]) {
      const actual = await execute(authFieldPage.toString(), mode),
        expected = await execute(serviceExpression("Y_"), mode);
      assert.deepEqual(actual, expected, mode);
      if (mode === "normal" || mode === "native" || mode === "otp")
        assert.equal(actual.value, "1234", mode);
      if (mode === "otp-cancel") assert.equal(actual.value, "");
    }
  } finally {
    await browser.close();
  }
});

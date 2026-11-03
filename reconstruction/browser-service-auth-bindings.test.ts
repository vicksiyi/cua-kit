import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { originalServiceBindings } from "./service-source";
import * as binding from "../packages/browser/src/service/browser_auth/bindings";
import { positiveTabId } from "../packages/browser/src/service/tab_id";
import { httpOrigin } from "../packages/browser/src/service/security/authority_builder";
import { downloadSourceOrigin } from "../packages/browser/src/service/context/downloads";
const old = originalServiceBindings(
  [
    "Ka",
    "Ch",
    "Va",
    "wv",
    "sN",
    "Ih",
    "Rh",
    "iN",
    "eN",
    "Qee",
    "_f",
    "RD",
    "ite",
    "_v",
  ],
  { W: positiveTabId, ze: httpOrigin, qe: downloadSourceOrigin },
);
async function outcome(fn: () => unknown) {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error: (error as Error).message };
  }
}
const base = {
  domainAndRegistry: "fixture.test",
  frameId: "root",
  loaderId: "loader",
  url: "https://fixture.test/",
  securityOrigin: "https://fixture.test",
};
test("auth page binding and document/site identity match original", async () => {
  for (const change of [
    {},
    { id: "" },
    { loaderId: "" },
    { securityOrigin: "https://other.test" },
    { url: "file:///tmp/test" },
    { url: "https://fixture.test/#fragment" },
    { domainAndRegistry: undefined },
  ])
    for (const origin of [
      undefined,
      "https://fixture.test",
      "https://other.test",
      "",
    ]) {
      const context: any = {
        cdp: {
          async call() {
            return { frameTree: { frame: { ...base, id: "root", ...change } } };
          },
        },
      };
      assert.deepEqual(
        await binding.readAuthPageBinding("7", origin, context),
        await old.Ka("7", origin, context),
      );
      assert.deepEqual(
        await binding.revalidateAuthPage("7", origin, base, context),
        await old.Ch("7", origin, base, context),
      );
    }
  for (const other of [
    base,
    { ...base, loaderId: "changed" },
    { ...base, domainAndRegistry: "other.test" },
    { ...base, domainAndRegistry: "", url: "https://sub.fixture.test" },
  ]) {
    assert.equal(binding.sameAuthDocument(base, other), old.Va(base, other));
    assert.equal(binding.sameAuthSite(base, other), old.wv(base, other));
  }
});
async function run(source: boolean, mode: string) {
  const trace: any[] = [],
    realm = vm.createContext({
      window: {},
      element: {
        ownerDocument: {
          defaultView: { location: { href: "https://fixture.test/#fragment" } },
        },
      },
    });
  const nested = "iframe >> internal:control=enter-frame >> ";
  const request: any = {
    tab_id: "7",
    timeout_ms: 50,
    fields: [
      {
        selector:
          mode === "nested" || mode === "intermediate"
            ? nested + nested + "input"
            : "a",
      },
      { selector: "b" },
    ],
    options: [{ id: "one", selector: "opt" }, { id: "two" }],
  };
  if (mode === "empty") request.fields = [];
  if (mode === "submit") request.submit = { selector: "submit" };
  const context: any = {
    playwright: {
      async evaluateOnPlaywrightSelectorWithTarget(
        tab: string,
        selector: string,
        callback: Function,
        options: any,
      ) {
        trace.push(["evaluate", tab, selector, options]);
        if (mode === "error") throw new Error("selector error");
        const identity: any = {
          ...base,
          ...(selector === "b" && mode === "loader"
            ? { loaderId: "other" }
            : {}),
          ...(mode === "file" ? { url: "file:///tmp/page" } : {}),
        };
        const result =
          mode === "file"
            ? "file:///tmp/page#fragment"
            : vm.runInContext(`(${callback.toString()})(element)`, realm);
        return {
          frameIdentity:
            mode === "no-identity"
              ? undefined
              : mode === "url-mismatch"
                ? { ...identity, url: "https://other.test" }
                : identity,
          result,
          target: {
            tabId: 7,
            ...(selector === "b" && mode === "target"
              ? { sessionId: "other" }
              : {}),
          },
        };
      },
      async selectorsResolveToDistinctElements(
        tab: string,
        selectors: string[],
        options: any,
      ) {
        trace.push(["distinct", tab, selectors, options]);
        return mode !== "duplicate";
      },
    },
  };
  const functions = source
    ? [old.Rh, old.iN, old.eN, old.Qee, old._v]
    : [
        binding.readAuthFormBinding,
        binding.readAuthOptionBindings,
        binding.revalidateAuthForm,
        binding.validAuthIntermediateFrames,
        binding.distinctAuthElements,
      ];
  const first: any = await functions[0](request, context);
  const options: any = await functions[1](request, context);
  const revalidate = await functions[2](
    request,
    { ...base, origin: "https://fixture.test", targetKey: "7::" },
    context,
  );
  const intermediate = await functions[3](base, base, request, context);
  const distinct = await outcome(() =>
    functions[4](
      "7",
      request.fields.map((f: any) => f.selector),
      request,
      context,
    ),
  );
  return JSON.parse(
    JSON.stringify({
      first,
      options: options == null ? null : [...options],
      revalidate,
      intermediate,
      distinct,
      trace,
    }),
  );
}
test("auth form/option bindings and nested selector identities preserve original behavior", async () => {
  for (const mode of [
    "normal",
    "empty",
    "submit",
    "nested",
    "intermediate",
    "error",
    "loader",
    "target",
    "file",
    "no-identity",
    "url-mismatch",
    "duplicate",
  ])
    assert.deepEqual(await run(false, mode), await run(true, mode), mode);
});
test("auth bindings inspect real Chromium frame identity and stable DOM element IDs", async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://binding.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<input id="a"><input id="b">',
      }),
    );
    await page.goto("https://binding.test/");
    const session = await page.context().newCDPSession(page);
    const cdp: any = {
      async call(_id: number, method: string) {
        return session.send(method as any);
      },
    };
    const playwright: any = {
      async evaluateOnPlaywrightSelectorWithTarget(
        _tab: string,
        selector: string,
        callback: Function,
      ) {
        const { frameTree } = await session.send("Page.getFrameTree");
        // Adapter strips a fixture routing prefix; actual OOPIF/provider routing is not asserted.
        const css = selector
          .split(" >> internal:control=enter-frame >> ")
          .at(-1)!;
        const result = await page
          .locator(css)
          .evaluate(
            new Function(
              "element",
              `return (${callback.toString()})(element)`,
            ) as any,
          );
        return {
          result,
          target: { tabId: 7 },
          frameIdentity: {
            frameId: frameTree.frame.id,
            loaderId: frameTree.frame.loaderId,
            url: frameTree.frame.url,
            domainAndRegistry: frameTree.frame.domainAndRegistry,
          },
        };
      },
      async selectorsResolveToDistinctElements(
        _tab: string,
        selectors: string[],
      ) {
        return page.evaluate(
          (values) =>
            new Set(values.map((value) => document.querySelector(value)))
              .size === values.length,
          selectors,
        );
      },
    };
    const context = { cdp, playwright },
      request = {
        tab_id: "7",
        fields: [{ selector: "#a" }, { selector: "#b" }],
      };
    const first = await binding.readAuthFormBinding(request, context);
    assert.ok(first);
    assert.equal(
      await binding.revalidateAuthForm(request, first, context),
      null,
    );
    const prefix = "fixture >> internal:control=enter-frame >> ";
    assert.equal(
      await binding.distinctAuthElements(
        "7",
        [prefix + "#a", prefix + "#b"],
        request,
        context,
      ),
      true,
    );
    assert.equal(
      await binding.distinctAuthElements(
        "7",
        [prefix + "#a", prefix + "#a"],
        request,
        context,
      ),
      false,
    );
    await page.reload();
    assert.equal(
      await binding.revalidateAuthForm(request, first, context),
      "page_changed",
    );
  } finally {
    await browser.close();
  }
});

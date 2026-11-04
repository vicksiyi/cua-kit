import assert from "node:assert/strict";
import test from "node:test";
import {
  DocumentationController,
  unavailableApiMembers,
  selectDocumentation,
  renderApiReference,
  renderCapabilityDocumentation,
} from "../packages/browser/src/service/runtime/documentation_controller";
import { browserCapabilityDefinitions } from "../packages/browser/src/capabilities/browser";
import { tabCapabilityDefinitions } from "../packages/browser/src/capabilities/tab";
import { originalServiceBindings } from "./service-source";
const original = originalServiceBindings(
  ["z3", "K3", "Y3", "Due", "X3", "J3", "ib"],
  { pf: browserCapabilityDefinitions, of: tabCapabilityDefinitions },
);
const manifest: any = {
  root: "Browser",
  interfaces: {
    Browser: {
      tabs: { declarations: [{ text: "tabs: Tabs;", references: ["Tabs"] }] },
      hidden: {
        documented: false,
        declarations: [{ text: "hidden: Hidden;", references: ["Hidden"] }],
      },
      conditional: {
        unsupportedByDefaultIn: ["cdp"],
        declarations: [
          { text: "conditional(): Value;", references: ["Value"] },
          {
            text: "conditional(n: string): Extra;",
            references: ["Extra"],
            unsupportedByDefaultIn: ["extension"],
          },
          {
            text: "undocumented(): Hidden;",
            references: ["Hidden"],
            documented: false,
          },
        ],
      },
    },
    Tabs: {
      new: {
        declarations: [{ text: "new(): Browser;", references: ["Browser"] }],
      },
    },
  },
  types: {
    Hidden: { text: "type Hidden = never;", references: [] },
    Value: { text: "type Value = Extra;", references: ["Extra"] },
    Extra: { text: "type Extra = string;", references: ["Missing", "Value"] },
    Unused: { text: "type Unused = number;", references: [] },
  },
};
const browser: any = {
  id: "browser",
  name: "Synthetic",
  type: "extension",
  capabilities: {
    browser: [{ id: "management" }, { id: "unknown" }],
    tab: [{ id: "cdp" }],
  },
};
const documents: any[] = [
  { name: "included", mode: "included", requiredFor: ["act"] },
  { name: "excluded", mode: "included", requiredFor: ["act"] },
  { name: "lookup", mode: "lookup", description: "Lookup help" },
  { name: "model", mode: "model" },
  {
    name: "conditional",
    mode: "included",
    when: { browserTypes: ["cdp"] },
    requiredFor: ["conditional_action"],
  },
  {
    name: "api",
    mode: "included",
    when: { requiredApiMembers: ["Browser.conditional"] },
  },
  {
    name: "browser-cap",
    mode: "lookup",
    when: { requiredBrowserCapabilities: ["management"] },
  },
  {
    name: "tab-cap",
    mode: "included",
    when: { requiredTabCapabilities: ["cdp"] },
  },
  {
    name: "no-tab-cap",
    mode: "included",
    when: { excludedTabCapabilities: ["cdp"] },
  },
];
test("documentation API availability, conditional guidance and reachable reference text match original", () => {
  for (const type of ["cdp", "extension", "iab"])
    for (const override of [undefined, true, false])
      for (const globalDisabled of [[], ["Browser.conditional"]])
        for (const caps of [
          {},
          { browser: [{ id: "management" }] },
          { tab: [{ id: "cdp" }] },
          { browser: [{ id: "management" }], tab: [{ id: "cdp" }] },
        ]) {
          const b = {
            ...browser,
            type,
            apiSupportOverrides:
              override === undefined ? {} : { "Browser.conditional": override },
            capabilities: caps,
          };
          const options = {
            apiManifest: manifest,
            browserInfo: b,
            disabledMemberIds: new Set(globalDisabled),
          };
          const expected = original.z3(options),
            actual = unavailableApiMembers(options);
          assert.deepEqual(actual, expected);
          const selection = {
            browserType: type,
            capabilities: caps,
            disabledApiMembers: actual,
          };
          assert.deepEqual(
            selectDocumentation(documents, selection),
            original.K3(documents, selection),
          );
          assert.equal(
            renderApiReference(manifest, type, actual),
            original.X3(manifest, type, actual),
          );
          assert(
            !renderApiReference(manifest, type, actual).includes("type Hidden"),
          );
          assert(
            !renderApiReference(manifest, type, actual).includes("type Unused"),
          );
        }
  for (const root of ["Missing", "Value", "Browser"])
    assert.equal(
      renderApiReference({ ...manifest, root }, "extension"),
      original.X3({ ...manifest, root }, "extension"),
    );
  for (const scope of ["browser", "tab", "other"])
    for (const caps of [
      undefined,
      [],
      [{ id: "unknown" }],
      [...browserCapabilityDefinitions, ...tabCapabilityDefinitions].map(
        ({ id }) => ({ id }),
      ),
    ])
      assert.equal(
        renderCapabilityDocumentation(scope, caps),
        original.J3(scope, caps),
      );
});
function make(Controller: any, flags: any = {}) {
  const trace: any[] = [];
  const options: any = {
    apiManifest: manifest,
    disabledMemberIds: new Set(),
    documentManifest: documents,
    excludedDocumentation: ["excluded", "lookup"],
    undocumentedApiMembers: flags.undocumented,
    addendum: flags.addendum,
    readDocumentation: async function (name: string, ...args: any[]) {
      trace.push([name, args.length, args[0], args[1], this === options]);
      if (flags.fail === name) throw Error("synthetic read failure");
      return "content:" + name;
    },
  };
  return { controller: new Controller(options), trace };
}
async function capture(fn: any) {
  try {
    return { value: await fn() };
  } catch (e: any) {
    return { error: e.message };
  }
}
async function scenario(Controller: any, flags: any) {
  const { controller: c, trace } = make(Controller, flags);
  const output: any[] = [];
  output.push(await capture(() => c.assertRequiredDocumentationRead("act")));
  output.push(await capture(() => c.read("missing")));
  output.push(await capture(() => c.read("lookup")));
  output.push(
    await capture(() =>
      c.readBrowser({ ...browser, type: flags.type ?? "extension" }),
    ),
  );
  output.push([...c.readNames]);
  output.push(await capture(() => c.assertRequiredDocumentationRead("act")));
  output.push(
    await capture(() =>
      c.assertRequiredDocumentationRead("conditional_action"),
    ),
  );
  output.push(await capture(() => c.read("excluded")));
  output.push([...c.readNames]);
  return { output, trace };
}
test("controller retains exact guidance output, read state, exclusion semantics and rejection ordering", async () => {
  for (const flags of [
    {},
    { addendum: "" },
    { addendum: "Extra instructions" },
    { undocumented: ["Browser.conditional"] },
    { type: "cdp" },
    { fail: "included" },
    { fail: "excluded" },
    { fail: "lookup" },
  ])
    assert.deepEqual(
      await scenario(DocumentationController, flags),
      await scenario(original.ib, flags),
    );
  const f = make(DocumentationController);
  const content = await f.controller.readBrowser(browser);
  assert(!f.trace.some((row) => row[0] === "excluded"));
  assert(f.controller.readNames.has("excluded"));
  f.controller.assertRequiredDocumentationRead("act");
  assert(content.includes("`lookup`: Lookup help"));
  assert(!f.controller.readNames.has("lookup"));
  assert.throws(
    () => f.controller.assertRequiredDocumentationRead("conditional_action"),
    /conditional/,
  );
  const fail = make(DocumentationController, { fail: "included" });
  await assert.rejects(fail.controller.readBrowser(browser));
  assert.equal(fail.controller.readNames.size, 0);
});
test("parallel guidance reads mark state only after all reads and rendering succeed", async () => {
  for (const Controller of [original.ib, DocumentationController]) {
    let resolve!: () => void;
    const gate = new Promise<void>((r) => (resolve = r));
    const calls: string[] = [];
    const c = new Controller({
      apiManifest: manifest,
      disabledMemberIds: [],
      documentManifest: [
        { name: "a", mode: "included", requiredFor: ["act"] },
        { name: "b", mode: "included", requiredFor: ["act"] },
      ],
      readDocumentation: async (name: string) => {
        calls.push(name);
        if (name === "a") await gate;
        return name;
      },
    });
    const pending = c.readBrowser(browser);
    assert.deepEqual(calls, ["a", "b"]);
    assert.equal(c.readNames.size, 0);
    assert.throws(() => c.assertRequiredDocumentationRead("act"));
    resolve();
    await pending;
    c.assertRequiredDocumentationRead("act");
    c.readNames.clear();
    await assert.rejects(
      c.readBrowser({ ...browser, capabilities: undefined }),
    );
    assert.equal(c.readNames.size, 0);
  }
});
test("installed API manifest renders identically across backend types and disabled members", async () => {
  const { readFile } = await import("node:fs/promises");
  const root =
    process.env.CUA_VENDOR_ROOT ??
    "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
  const actualManifest = JSON.parse(
    await readFile(
      `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/references/api.json`,
      "utf8",
    ),
  );
  let references = 0;
  for (const type of ["extension", "cdp", "iab", "mcpapps"])
    for (const hidden of [
      [],
      ["Browser.tabs"],
      ["Tab.playwright", "Tab.cua"],
    ]) {
      const options = {
        apiManifest: actualManifest,
        browserInfo: { ...browser, type },
        disabledMemberIds: hidden,
      };
      const disabled = unavailableApiMembers(options);
      assert.deepEqual(disabled, original.z3(options));
      const actual = renderApiReference(actualManifest, type, disabled);
      assert.equal(actual, original.X3(actualManifest, type, disabled));
      assert(actual.length > 100);
      references++;
    }
  assert.equal(references, 12);
});

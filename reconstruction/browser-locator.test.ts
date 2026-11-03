import {
  tabCapabilityDefinitions,
  tabCapabilityFactories,
} from "../packages/browser/dist/capabilities/tab.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PlaywrightLocator } from "../packages/browser/dist/playwright/locator.js";
import { PlaywrightFrameLocator } from "../packages/browser/dist/playwright/frame_locator.js";
import {
  BrowserAuthTabCapability,
  browserAuthTabCapabilityDefinition,
} from "../packages/browser/dist/capabilities/tab_browser_auth.js";
import * as commands from "../packages/browser/dist/commands/playwright_locator.js";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
  "utf8",
);
const original = await import(
  `data:text/javascript;base64,${Buffer.from(source + "\nexport {kl,Ol,Uu,zu,gh,wh,So,Ro,Oo,Do,zo,Go,ec,sc,lc,_c,vc,jc,Ec,Zc,Bc,Wc,Gs};").toString("base64")}`
);
const local = {
  Locator: PlaywrightLocator,
  Frame: PlaywrightFrameLocator,
  Auth: BrowserAuthTabCapability,
};
const old = { Locator: original.kl, Frame: original.Ol, Auth: original.Uu };
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (e) {
    return { error: { name: e.name, message: e.message } };
  }
}
const item = {
  attributes: { title: "one" },
  inner_text: "one",
  text_content: "first",
};
function fixture(impl: any, send?: (command: any) => any) {
  const calls: any[] = [];
  let clears = 0;
  const transport = {
    display: async () => {},
    async send(args: any) {
      const command = args.command.toJSON();
      calls.push({ ...args, command });
      if (send) return send(command);
      return {
        value: "value",
        values: [item, { ...item, inner_text: "two" }],
        count: 2,
        path: "/tmp/media",
      };
    },
  };
  const create = (extra = {}) =>
    new impl.Locator({
      browserId: "b",
      tabId: "t",
      selector: "article",
      transport,
      ...extra,
    });
  return {
    calls,
    transport,
    create,
    get clears() {
      return clears;
    },
    cache: {
      clear() {
        clears++;
      },
      async read() {
        return null;
      },
    },
  };
}
async function actionScenario(impl: any) {
  const f = fixture(impl);
  const locator = f.create({ collectionReadCache: f.cache });
  const values = [];
  for (const [method, args] of [
    ["click", []],
    [
      "click",
      [{ modifiers: ["Shift"], button: "right", force: true, timeoutMs: 20 }],
    ],
    ["dblclick", [{ timeoutMs: 7 }]],
    ["fill", [""]],
    ["type", ["abc", { timeoutMs: 9 }]],
    ["press", ["Enter"]],
    ["pressSequentially", ["abc"]],
    ["pressSequentially", ["abc", { timeoutMs: null }]],
    ["selectOption", ["a"]],
    ["selectOption", [[{ label: "A", index: 0 }, "b"], { timeoutMs: 15 }]],
    ["setChecked", [true, { force: false }]],
    ["check", []],
    ["uncheck", []],
    ["waitFor", [{ state: "visible", timeoutMs: 8 }]],
    ["downloadMedia", []],
    ["downloadMedia", [{ timeoutMs: 45 }]],
    ["count", []],
    ["textContent", []],
    ["innerText", [{ timeoutMs: 2 }]],
    ["getAttribute", ["title"]],
    ["isVisible", []],
    ["isEnabled", []],
    ["allTextContents", []],
    ["evaluate", ["element.textContent", { a: 1 }, { timeoutMs: 12 }]],
    [
      "evaluateAll",
      [(elements) => elements.length, undefined, { timeoutMs: 13 }],
    ],
  ] as any[])
    values.push(await locator[method](...args));
  return { calls: f.calls, values, clears: f.clears };
}
test("Locator actions, reads, evaluation, download and cache invalidation match original payloads", async () => {
  assert.deepEqual(await actionScenario(local), await actionScenario(old));
});
async function invalidScenario(impl: any) {
  const f = fixture(impl),
    locator = f.create(),
    results = [];
  for (const [method, args] of [
    ["fill", [null]],
    ["type", [undefined]],
    ["press", [null]],
    ["pressSequentially", [null]],
    ["setChecked", [1]],
    ["waitFor", [{ state: "" }]],
    ["getAttribute", [""]],
    ["selectOption", [[]]],
    ["selectOption", [null]],
    ["selectOption", [[{}]]],
    ["selectOption", [[{ value: 5 }]]],
    ["selectOption", [[{ label: 5 }]]],
    ["selectOption", [[{ index: -1 }]]],
    ["selectOption", [[{ index: 1.2 }]]],
  ] as any[])
    results.push(await outcome(() => locator[method](...args)));
  return { results, calls: f.calls };
}
test("Locator local validation rejects original cases before transport or diagnostics", async () => {
  assert.deepEqual(await invalidScenario(local), await invalidScenario(old));
});
async function chainScenario(impl: any) {
  const f = fixture(impl),
    locator = f.create(),
    other = f.create({ selector: "aside" });
  const chains = [
    locator.locator("a", { hasText: "hello" }),
    locator.first(),
    locator.last(),
    locator.nth(NaN),
    locator.and(other),
    locator.or(other),
    locator.filter({
      hasText: /hi/i,
      hasNotText: "no",
      has: other,
      hasNot: other,
      visible: false,
    }),
    locator.getByRole("button", { name: "Go", exact: true }),
    locator.getByText("Text"),
    locator.getByLabel(/User/i),
    locator.getByPlaceholder("Search"),
    locator.getByTestId("test"),
  ];
  const details = chains.map((value) =>
    impl.Locator.browserAuthSelector(value),
  );
  const errors = [];
  for (const fn of [
    () => locator.locator(""),
    () => locator.nth("1"),
    () => locator.and({}),
    () => locator.or(f.create({ tabId: "other" })),
    () => locator.filter({ has: {} }),
    () => locator.filter({ hasNot: f.create({ browserId: "other" }) }),
    () => locator.filter({ visible: 1 }),
  ])
    errors.push(await outcome(fn));
  const frame = new impl.Frame({
    browserId: "b",
    tabId: "t",
    frameSelector: "iframe",
    transport: f.transport,
  }).frameLocator("#inner");
  for (const value of [
    frame.locator("button"),
    frame.getByRole("button"),
    frame.getByText("a"),
    frame.getByLabel("b"),
    frame.getByPlaceholder("c"),
    frame.getByTestId("d"),
  ])
    details.push(impl.Locator.browserAuthSelector(value));
  errors.push(
    await outcome(() => frame.locator("")),
    await outcome(() => frame.frameLocator("")),
  );
  return { details, errors, calls: f.calls };
}
test("Locator composition and nested FrameLocator preserve selectors, target identity and validation", async () => {
  assert.deepEqual(await chainScenario(local), await chainScenario(old));
});
async function collectionScenario(impl: any) {
  const f = fixture(impl),
    locator = f.create(),
    [first, second] = await locator.all();
  const values = [
    await first.innerText({ timeoutMs: 5 }),
    await second.textContent({ timeoutMs: 99 }),
    await first.getAttribute("title"),
    await first.getAttribute("missing"),
  ];
  // Direct filtering of a collection item drops cache; a relative child filter retains it.
  values.push(await first.filter({ visible: true }).innerText());
  values.push(
    await first.locator("span").filter({ visible: true }).innerText(),
  );
  values.push(
    await second.locator("span").filter({ visible: true }).innerText(),
  );
  await first.click();
  values.push(await second.innerText());
  await first.waitFor({ state: "visible" });
  values.push(await second.innerText());
  for (const child of [
    first.first(),
    first.last(),
    first.nth(0),
    first.getByText("hello"),
    first.filter({}),
  ])
    values.push(await child.innerText());
  return { values, calls: f.calls };
}
test("all() locators share read cache with original filter retention and action invalidation rules", async () => {
  assert.deepEqual(
    await collectionScenario(local),
    await collectionScenario(old),
  );
});
const fakeElements = Array.from({ length: 7 }, (_, index) => ({
  tagName: "BUTTON",
  textContent: "  " + String(index).repeat(150) + "  ",
  disabled: index === 2,
  getClientRects() {
    return index % 2 ? [{}] : [];
  },
  getAttribute(name: string) {
    return name === "role" ? "button" : null;
  },
}));
async function diagnosticScenario(impl: any, failDiagnostics = false) {
  const calls: any[] = [];
  const f = fixture(impl, async (command) => {
    if (command.type !== "playwright_evaluate")
      throw new Error("strict mode violation");
    const script = command.script;
    // Evaluate both serialized callbacks against the same elements. Renamed TS locals alter source text, not executed behavior.
    const value = await new (Object.getPrototypeOf(
      async function () {},
    ).constructor)("elements", script)(fakeElements);
    calls.push({ ...command, scriptResult: value, script: undefined });
    if (failDiagnostics) throw new Error("diagnostics unavailable");
    return { value };
  });
  const locator = f.create();
  const error = await outcome(() => locator.click());
  return {
    error,
    diagnostics: calls,
    commands: f.calls.map((call) => ({
      ...call,
      command: { ...call.command, script: undefined },
    })),
  };
}
test("action failures produce matching executed DOM diagnostics, truncation, timeout and fallback errors", async () => {
  assert.deepEqual(
    await diagnosticScenario(local),
    await diagnosticScenario(old),
  );
  assert.deepEqual(
    await diagnosticScenario(local, true),
    await diagnosticScenario(old, true),
  );
});
async function authScenario(impl: any) {
  const f = fixture(impl),
    sent: any[] = [];
  const auth = new impl.Auth({
    browserId: "b",
    tabId: "t",
    info: { id: "browserAuth", description: "auth" },
    documentation: { get: async () => "" },
    transport: {
      display: async () => {},
      async send({ command }: any) {
        sent.push(command.toJSON());
        return { status: "submitted", extra: 1 };
      },
    },
  });
  const base = {
    origin: "https://example.com",
    account_identifier: "alice",
    fields: [
      {
        id: "password",
        label: "Password",
        type: "password",
        required: true,
        selector: f.create().getByLabel("Password"),
        autocomplete: null,
      },
    ],
    submit: {
      action: "click",
      selector: f.create().getByRole("button", { name: "Login" }),
    },
  };
  const results = [
    await outcome(() => auth.request(base)),
    await outcome(() =>
      auth.request({ ...base, qr_code: false, options: null }),
    ),
    await outcome(() =>
      auth.request({
        ...base,
        options: [
          {
            id: "password",
            label: " Password ",
            field_ids: ["password"],
            selector: null,
          },
        ],
      }),
    ),
  ];
  for (const selector of [
    { selector: "fake" },
    f.create({ tabId: "other" }),
    f.create({ browserId: "other" }),
  ])
    results.push(
      await outcome(() =>
        auth.request({ ...base, fields: [{ ...base.fields[0], selector }] }),
      ),
    );
  results.push(await outcome(() => auth.request({ ...base, fields: [] })));
  return { results, sent };
}
test("browserAuth uses genuine locator identity, serializes selectors, validates before send and parses result", async () => {
  assert.deepEqual(await authScenario(local), await authScenario(old));
  assert.deepEqual(browserAuthTabCapabilityDefinition.info, original.zu.info);
});
test("Locator command schemas match original parse errors and raw construction", async () => {
  const pairs = [
    ["LocatorClick", "So"],
    ["LocatorDoubleClick", "Ro"],
    ["LocatorDownloadMedia", "Oo"],
    ["LocatorFill", "Do"],
    ["LocatorPress", "zo"],
    ["LocatorPressSequentially", "Go"],
    ["LocatorWaitFor", "ec"],
    ["LocatorCount", "sc"],
    ["LocatorSelectOption", "lc"],
    ["LocatorSetChecked", "_c"],
    ["LocatorIsVisible", "vc"],
    ["LocatorIsEnabled", "jc"],
    ["LocatorAllTextContents", "Ec"],
    ["LocatorTextContent", "Zc"],
    ["LocatorInnerText", "Bc"],
    ["LocatorGetAttribute", "Wc"],
    ["PlaywrightEvaluate", "Gs"],
  ];
  for (const [name, symbol] of pairs) {
    const ours = commands[name],
      theirs = original[symbol];
    for (const payload of [
      {
        browser_id: "b",
        tab_id: "t",
        selector: "a",
        value: "text",
        replace: true,
        checked: false,
        state: "visible",
        selections: [{ label: "A" }],
        script: "return 1",
        name: "title",
      },
      { browser_id: 4, timeout_ms: 0 },
      {
        browser_id: "b",
        tab_id: "t",
        selector: "a",
        selections: [{}],
        timeout_ms: 1.5,
      },
    ]) {
      assert.deepEqual(
        ours.create(payload).toJSON(),
        theirs.create(payload).toJSON(),
      );
      assert.deepEqual(
        await outcome(() => ours.create(payload).parse()),
        await outcome(() => theirs.create(payload).parse()),
      );
    }
    for (const result of [
      {},
      { value: null },
      { value: "ok", values: ["a"], count: 2, path: "/tmp/test", extra: 1 },
      { count: 1.5 },
    ])
      assert.deepEqual(
        await outcome(() => ours.ResultSchema.parse(result)),
        await outcome(() => theirs.ResultSchema.parse(result)),
      );
  }
});

test("Locator and frame prototypes expose original method order and arity", () => {
  for (const [ours, theirs] of [
    [PlaywrightLocator, original.kl],
    [PlaywrightFrameLocator, original.Ol],
    [BrowserAuthTabCapability, original.Uu],
  ]) {
    assert.deepEqual(
      Object.getOwnPropertyNames(ours.prototype),
      Object.getOwnPropertyNames(theirs.prototype),
    );
    for (const name of Object.getOwnPropertyNames(ours.prototype).filter(
      (name) => name !== "constructor",
    ))
      assert.equal(
        ours.prototype[name].length,
        theirs.prototype[name].length,
        name,
      );
  }
});

test("five Tab capabilities retain source registration order, metadata and factory identity", () => {
  assert.deepEqual(
    tabCapabilityDefinitions.map(({ id, info, internalOnly }) => ({
      id,
      info,
      internalOnly,
    })),
    original.gh.map(({ id, info, internalOnly }) => ({
      id,
      info,
      internalOnly,
    })),
  );
  assert.deepEqual([...tabCapabilityFactories.keys()], [...original.wh.keys()]);
  for (const definition of tabCapabilityDefinitions)
    assert.equal(tabCapabilityFactories.get(definition.id), definition.create);
});

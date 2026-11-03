import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createApiView,
  getDisabledMemberIds,
} from "../packages/browser/dist/runtime/api_view.js";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const bundle = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
  "utf8",
);
const original = await import(
  `data:text/javascript;base64,${Buffer.from(bundle + "\nexport {jm as Factory,p as runtimeTypes,jh as Tab};").toString("base64")}`
);
function makeOriginal(manifest: any, decorate: any) {
  return new original.Factory({
    apiManifest: manifest,
    decorateTab: decorate,
    disabledMemberIds: new Set(),
  }).view;
}
function makeRestored(manifest: any, decorate: any) {
  return createApiView(manifest, decorate, original.runtimeTypes, original.Tab);
}

async function scenario(factory: any) {
  const events: any[] = [];
  const manifest = { interfaces: { Tab: {}, Agent: {} } };
  const view = factory(manifest, (tab: any) => {
    events.push(["decorate", tab.name, tab.self() === tab]);
  });
  // Real original prototype supplies instanceof identity. Own fixtures probe the proxy
  // without invoking unrelated incomplete Tab components or a real browser backend.
  const raw: any = Object.create(original.Tab.prototype);
  const other: any = Object.create(original.Tab.prototype);
  Object.assign(raw, {
    name: "one",
    visible: 1,
    secret: 2,
    self() {
      return this;
    },
  });
  Object.assign(other, {
    name: "two",
    self() {
      return this;
    },
  });
  raw.child = other;
  raw.check = function (arg: any) {
    return [
      this === raw,
      arg === raw,
      arg?.nested?.[0] === other,
      Object.getPrototypeOf(arg) === Object.prototype,
    ];
  };
  raw.promise = function () {
    return Promise.resolve([other, raw]);
  };
  raw.plain = function () {
    return { child: other };
  };
  const symbol = Symbol("symbol");
  raw[symbol] = function () {
    return this === raw;
  };
  Object.defineProperty(raw, "getter", {
    enumerable: true,
    configurable: true,
    get() {
      events.push(["getter-this", this === raw]);
      return other;
    },
  });
  const disabled = new Set(["Tab.secret"]);
  const proxy = view(raw, disabled);
  const descriptor = Object.getOwnPropertyDescriptor(proxy, "child")!;
  const methods = proxy.self;
  const initialKeys = Reflect.ownKeys(proxy).map((k) =>
    typeof k === "symbol" ? k.toString() : k,
  );
  const result: any = {
    decorated: events.slice(),
    same: proxy.self() === proxy,
    stableMethod: proxy.self === methods,
    constructorUnwrapped: proxy.constructor === original.Tab,
    childStable: proxy.child === proxy.child,
    descriptorWrapped: descriptor.value === proxy.child,
    ownKeys: initialKeys,
    hasSecret: "secret" in proxy,
    readSecret: proxy.secret,
    descriptorSecret: Object.getOwnPropertyDescriptor(proxy, "secret"),
    symbolCall: proxy[symbol](),
    rawThis: proxy.check(proxy),
    nestedUnwrap: proxy.check({ nested: [proxy.child] }),
    nullProto: proxy.check(
      Object.assign(Object.create(null), { nested: [proxy.child] }),
    ),
    getterWrapped: proxy.getter === proxy.child,
    plainResultUnwrapped: proxy.plain().child === other,
  };
  const asyncResult = await proxy.promise();
  result.promiseIdentity = [
    asyncResult[0] === proxy.child,
    asyncResult[1] === proxy,
  ];
  const second = view(raw, new Set());
  result.newView = second !== proxy;
  result.alreadyProxy = view(proxy, new Set(["Tab.visible"])) === proxy;
  result.crossViewUnwrap = second.check(proxy);
  raw.self = function () {
    return "replacement";
  };
  result.methodCacheSurvivesReplacement = proxy.self === methods;
  result.oldMethodStillBound = proxy.self() === proxy;
  disabled.add("Tab.visible");
  result.liveDisabled = !("visible" in proxy) && proxy.visible === undefined;
  disabled.delete("Tab.secret");
  result.reenabled = proxy.secret;
  result.events = events;
  return result;
}

test("manifest view matches original identity caches, descriptor filtering, decoration and recursive argument unwrapping", async () => {
  assert.deepEqual(await scenario(makeRestored), await scenario(makeOriginal));
});

test("manifest view preserves original registration failures and proxy invariant failures", async () => {
  for (const name of ["UnknownInterface", "Commands", "setupBrowserRuntime"]) {
    const errors = [];
    for (const factory of [makeRestored, makeOriginal])
      try {
        factory({ interfaces: { [name]: {} } }, undefined);
        errors.push("no error");
      } catch (e) {
        errors.push({ name: e.name, message: e.message });
      }
    assert.deepEqual(errors[0], errors[1]);
  }
  function run(factory: any) {
    const view = factory({ interfaces: { Tab: {} } }, undefined);
    const raw = Object.create(original.Tab.prototype);
    Object.defineProperty(raw, "locked", {
      value: 1,
      configurable: false,
      enumerable: true,
    });
    const proxy = view(raw, new Set(["Tab.locked"]));
    const results = [];
    for (const op of [
      () => proxy.locked,
      () => Object.keys(proxy),
      () => "locked" in proxy,
      () => Object.getOwnPropertyDescriptor(proxy, "locked"),
    ]) {
      try {
        results.push(op());
      } catch (e) {
        results.push({ name: e.name, message: e.message });
      }
    }
    const plain = { tab: raw };
    results.push(view(plain, new Set()) === plain);
    return results;
  }
  assert.deepEqual(run(makeRestored), run(makeOriginal));
  // Decorator throws propagate after the instance has been wrapped, not swallowed.
  for (const factory of [makeRestored, makeOriginal]) {
    const view = factory({ interfaces: { Tab: {} } }, () => {
      throw new Error("decorate failed");
    });
    assert.throws(
      () => view(Object.create(original.Tab.prototype), new Set()),
      /decorate failed/,
    );
  }
});

test("per-browser unsupported defaults and overrides match original factory without enabling global exclusions", () => {
  const members = {
    history: { unsupportedByDefaultIn: ["cdp"] },
    documentation: {},
    nameSession: { unsupportedByDefaultIn: ["extension"] },
    tabs: {},
    user: {},
    capabilities: {},
  };
  const apiManifest = { interfaces: { Browser: members } };
  for (const type of ["cdp", "iab", "extension"])
    for (const overrides of [
      undefined,
      {},
      { "Browser.history": true },
      { "Browser.history": false },
      { "Browser.documentation": false },
    ])
      for (const initial of [
        [],
        ["Browser.history"],
        ["Browser.documentation", "Tab.goto"],
      ]) {
        const factory = new original.Factory({
          apiManifest,
          disabledMemberIds: new Set(initial),
        });
        const browserInfo = {
          id: "b",
          type,
          apiSupportOverrides: overrides,
          capabilities: {},
        };
        const proxy = factory.createBrowser({
          browserInfo,
          transport: {},
          onBrowserUsed: undefined,
        });
        const disabled = getDisabledMemberIds({
          apiManifest,
          browserInfo,
          disabledMemberIds: new Set(initial),
        });
        for (const key of Object.keys(members))
          assert.equal(
            key in proxy,
            !disabled.has(`Browser.${key}`),
            `${type}/${key}`,
          );
        for (const id of initial) assert.equal(disabled.has(id), true);
      }
});

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import * as selectors from "../packages/browser/src/playwright/selectors";
import { CollectionReadCache } from "../packages/browser/src/playwright/collection_read_cache";
import { PlaywrightLocatorReadAll } from "../packages/browser/src/commands/playwright_read_all";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
  "utf8",
);
assert.equal(
  createHash("sha256").update(source).digest("hex"),
  "04d63754bb1134eae351c164e750c7a9b798de2757a734e7a62e14b63edf8de4",
);
const original = await import(
  `data:text/javascript;base64,${Buffer.from(source + "\nexport {Al as CollectionReadCache,Ml as appendRelativeSelector,Ol as escapeRegexForSelector,Zl as escapeTextForSelector,Nl as escapeAttributeForSelector,$l as roleSelector,ql as textSelector,Dl as labelSelector,Ll as placeholderSelector,Bl as testIdSelector,nd as ReadAll};").toString("base64")}`
);
function outcome(fn: () => any) {
  try {
    return { value: fn() };
  } catch (e) {
    return { error: { name: e.name, message: e.message } };
  }
}

test("selector builders preserve string/regex escaping, flags, cross-realm recognition and validation", () => {
  const matchers = [
    "",
    "hello",
    'a"b\\c\n >> d',
    /a>>b["'`]/gi,
    /a>>b["'`]/u,
    new RegExp("a>>b", "v"),
    runInNewContext("/a>>b/i"),
    null,
    undefined,
    42,
    {},
    { [Symbol.toStringTag]: "RegExp" },
  ];
  for (const [local, old] of [
    [selectors.textSelector, original.textSelector],
    [selectors.labelSelector, original.labelSelector],
    [selectors.placeholderSelector, original.placeholderSelector],
  ]) {
    for (const matcher of matchers)
      for (const exact of [true, false, undefined, "truthy"])
        assert.deepEqual(
          outcome(() => local(matcher, { exact })),
          outcome(() => old(matcher, { exact })),
        );
  }
  for (const text of matchers.slice(0, 7))
    for (const exact of [true, false]) {
      assert.equal(
        selectors.escapeTextForSelector(text, exact),
        original.escapeTextForSelector(text, exact),
      );
      assert.equal(
        selectors.escapeAttributeForSelector(text, exact),
        original.escapeAttributeForSelector(text, exact),
      );
    }
  for (const role of ["", "button", 42])
    for (const options of [
      {},
      { name: 'a"b', exact: true },
      { name: /a>>b/i, exact: false },
      { checked: true },
    ])
      assert.deepEqual(
        outcome(() => selectors.roleSelector(role, options)),
        outcome(() => original.roleSelector(role, options)),
      );
  for (const value of matchers.slice(0, 10))
    assert.deepEqual(
      outcome(() => selectors.testIdSelector(value)),
      outcome(() => original.testIdSelector(value)),
    );
  for (const parent of [undefined, "", "a"])
    for (const child of ["", "b"])
      assert.equal(
        selectors.appendRelativeSelector(parent, child),
        original.appendRelativeSelector(parent, child),
      );
});
function fixture(Cache: any) {
  const calls: any[] = [];
  const pending: any[] = [];
  const transport = {
    display: async () => {},
    send(args: any) {
      calls.push({ ...args, command: args.command.toJSON() });
      return new Promise((resolve, reject) =>
        pending.push({ resolve, reject }),
      );
    },
  };
  return {
    cache: new Cache({
      browserId: "b",
      tabId: "t",
      selector: "article",
      transport,
    }),
    calls,
    pending,
  };
}
const item = {
  attributes: { title: "title" },
  inner_text: "text",
  text_content: null,
};
async function cacheScenario(Cache: any) {
  const { cache, calls, pending } = fixture(Cache);
  const first = cache.read({ index: 0, timeoutMs: 10 });
  const second = cache.read({ index: 1, relativeSelector: "", timeoutMs: 999 });
  assert.equal(calls.length, 1);
  pending[0].resolve({ values: [item, null] });
  const result = [await first, await second, await cache.read({ index: 8 })];
  const child = cache.read({
    index: 0,
    relativeSelector: "span",
    timeoutMs: 20,
  });
  pending[1].resolve({ values: [item] });
  result.push(await child);
  cache.clear();
  const failure = cache.read({ index: 0 });
  const error = new Error("read failed");
  const rejected = assert.rejects(failure, (e) => e === error);
  pending[2].reject(error);
  await rejected;
  const retry = cache.read({ index: 0 });
  pending[3].resolve({ values: [item] });
  result.push(await retry);
  return { result, calls };
}
test("collection cache shares promises by relative selector, keeps first timeout, clears and retries failures", async () => {
  assert.deepEqual(
    await cacheScenario(CollectionReadCache),
    await cacheScenario(original.CollectionReadCache),
  );
});
async function raceScenario(Cache: any) {
  const { cache, calls, pending } = fixture(Cache);
  const stale = cache.read({ index: 0 });
  const rejection = assert.rejects(stale, /stale/);
  cache.clear();
  const fresh = cache.read({ index: 0 });
  pending[0].reject(new Error("stale"));
  await rejection;
  // Original unconditional delete evicts the newer entry too. Preserve this race rather than repairing it.
  const third = cache.read({ index: 0 });
  assert.equal(calls.length, 3);
  pending[1].resolve({ values: [item] });
  pending[2].resolve({ values: [null] });
  return { values: [await fresh, await third], calls };
}
test("collection cache preserves clear/in-flight-rejection race and does not validate transport results", async () => {
  assert.deepEqual(
    await raceScenario(CollectionReadCache),
    await raceScenario(original.CollectionReadCache),
  );
  for (const Cache of [CollectionReadCache, original.CollectionReadCache]) {
    const { cache, pending } = fixture(Cache);
    const read = cache.read({ index: 0 });
    const raw = { extra: "unvalidated" };
    pending[0].resolve({ values: [raw] });
    assert.equal(await read, raw);
  }
});
test("read-all command/schema matches original raw payload and parsed result behavior", () => {
  const base = { browser_id: "b", tab_id: "t", selector: "div" };
  for (const payload of [
    base,
    { ...base, relative_selector: "", timeout_ms: 1, extra: 1 },
    { ...base, timeout_ms: 0 },
    { ...base, timeout_ms: 1.5 },
    { ...base, selector: null },
  ]) {
    assert.deepEqual(
      PlaywrightLocatorReadAll.create(payload).toJSON(),
      original.ReadAll.create(payload).toJSON(),
    );
    assert.deepEqual(
      outcome(() => PlaywrightLocatorReadAll.create(payload).parse()),
      outcome(() => original.ReadAll.create(payload).parse()),
    );
  }
  for (const result of [
    { values: [item, null] },
    { values: [{ ...item, extra: true }], extra: true },
    { values: [{ ...item, attributes: { a: 1 } }] },
    { values: [] },
  ])
    assert.deepEqual(
      outcome(() => PlaywrightLocatorReadAll.ResultSchema.parse(result)),
      outcome(() => original.ReadAll.ResultSchema.parse(result)),
    );
});

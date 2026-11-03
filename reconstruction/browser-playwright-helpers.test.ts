import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import {
  isRegExp,
  isPlainObject,
  hasErrorMessage,
} from "../packages/browser/dist/runtime/object_utils.js";
import * as helpers from "../packages/browser/dist/playwright/helpers.js";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
  "utf8",
);
const original = await import(
  `data:text/javascript;base64,${Buffer.from(source + "\nexport {ml,pl,bl,_l,yl,wl,fl,gl,vl};").toString("base64")}`
);
function outcome(fn: () => any) {
  try {
    return { value: fn() };
  } catch (e) {
    return { error: { name: e.name, message: e.message } };
  }
}

test("runtime object predicates match original cross-realm, prototype and accessor behavior", () => {
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  const values = [
    null,
    undefined,
    3,
    "text",
    () => {},
    /test/i,
    runInNewContext("/x/g"),
    new Proxy(/x/, {}),
    { [Symbol.toStringTag]: "RegExp" },
    {},
    Object.create(null),
    Object.create(Object.create(null)),
    new (class {})(),
    new Date(),
    { message: "wanted" },
    Object.create({ message: "wanted" }),
    {
      get message() {
        throw new Error("getter failed");
      },
    },
    new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("prototype failed");
        },
      },
    ),
    revoked.proxy,
  ];
  for (const value of values) {
    assert.deepEqual(
      outcome(() => isRegExp(value)),
      outcome(() => original.ml(value)),
    );
    assert.deepEqual(
      outcome(() => isPlainObject(value)),
      outcome(() => original.pl(value)),
    );
    assert.deepEqual(
      outcome(() => hasErrorMessage(value, "wanted")),
      outcome(() => original.bl(value, "wanted")),
    );
  }
});

test("Playwright evaluation builders retain argument serialization, function/string output and error ordering", () => {
  const cyclic: any = {};
  cyclic.self = cyclic;
  const args = [
    undefined,
    null,
    false,
    0,
    "中文",
    { a: 1 },
    [1, undefined],
    () => 1,
    Symbol("s"),
    1n,
    cyclic,
    {
      toJSON() {
        throw new Error("json failed");
      },
    },
  ];
  const pageFunctions = [
    "",
    "document.title",
    (arg: any) => arg,
    async (arg: any) => arg,
    undefined,
    null,
    4,
  ];
  for (const arg of args) {
    assert.deepEqual(
      outcome(() => helpers.serializeEvaluationArgument(arg)),
      outcome(() => original.wl(arg)),
    );
    for (const fn of pageFunctions) {
      assert.deepEqual(
        outcome(() => helpers.pageEvaluationScript(fn as any, arg)),
        outcome(() => original.fl(fn, arg)),
      );
      for (const mode of ["all", "single", "invalid"])
        assert.deepEqual(
          outcome(() =>
            helpers.locatorEvaluationScript(fn as any, arg, mode as any),
          ),
          outcome(() => original.gl(fn, arg, mode)),
        );
    }
  }
});

test("Playwright error classification, contextual stacks and coordinate validation follow original precedence", () => {
  const errors = [
    new Error("STRICT MODE VIOLATION: many"),
    new Error("element intercepts pointer"),
    new Error("receives pointer events"),
    new Error("ordinary"),
    "strict mode violation",
    null,
    42,
  ];
  for (const error of errors)
    for (const diagnostics of [
      {},
      { matchCount: 0, visibleCount: 0 },
      { matchCount: 1, visibleCount: 0 },
      { matchCount: 1, visibleCount: 1 },
    ])
      assert.equal(
        helpers.classifyActionError(error, diagnostics),
        original.yl(error, diagnostics),
      );
  for (const input of ["plain", null, 42, new Error("original")]) {
    if (input instanceof Error) input.stack = "saved original stack";
    const a = helpers.appendErrorContext(input, "context"),
      b = original._l(input, "context");
    assert.equal(a.message, b.message);
    assert.equal(a.name, b.name);
    if (input instanceof Error) assert.equal(a.stack, b.stack);
  }
  for (const point of [
    { x: 1, y: 2, extra: 3 },
    { x: NaN, y: 2 },
    { x: 1, y: Infinity },
    { x: "1", y: 2 },
    {},
  ])
    assert.deepEqual(
      outcome(() => helpers.requireCoordinates("test", point as any)),
      outcome(() => original.vl("test", point)),
    );
  // Native TypeError text embeds renamed JS variable identifiers; custom errors above
  // remain byte-for-byte. Restrict normalization to this known identifier difference.
  for (const point of [null, undefined]) {
    const a = outcome(() => helpers.requireCoordinates("test", point as any));
    const b = outcome(() => original.vl("test", point));
    if (a.error)
      a.error.message = a.error.message.replace("of 'point'", "of '<arg>'");
    if (b.error)
      b.error.message = b.error.message.replace("of 't'", "of '<arg>'");
    assert.deepEqual(a, b);
  }
});

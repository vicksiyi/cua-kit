import assert from "node:assert/strict";
import test from "node:test";
import { injectedExpression } from "./injected-source";
import {
  createTextMatcher,
  ExpectedTextMatcher,
  normalizeWhitespace,
  resetWhitespaceCache,
  unquoteTextSelector,
  visibleWhitespace,
} from "../packages/browser/src/service/playwright/injected/text_matcher";
const original = new Function(
  `let we; ${["O", "li", "ro", "ht", "ut", "pe"].map((name) => `const ${name} = ${injectedExpression(name)};`).join("\n")} return { normalize: O, reset: li, unquote: ro, matcher: ht, visible: ut, Expected: pe };`,
)();
function outcome(fn: () => any) {
  try {
    return { value: fn() };
  } catch (error: any) {
    return { error: error.name, message: error.message };
  }
}
const texts = [
  "",
  "hello",
  "Hello",
  " hello  world\n",
  "\u200bhello\u00ad",
  "line\nnext\tvalue",
  "İ",
  "😀",
  "a/b",
  "null",
  "alpha beta",
];
test("embedded helper whitespace, quoting and visible formatting match original", () => {
  for (const reset of [false, true, true]) {
    if (reset) {
      original.reset();
      resetWhitespaceCache();
    }
    for (const value of [...texts, '"a\\nb"', "'a\\'b'", '"trailing\\"']) {
      assert.equal(normalizeWhitespace(value), original.normalize(value));
      assert.equal(unquoteTextSelector(value), original.unquote(value));
      assert.equal(visibleWhitespace(value), original.visible(value));
    }
  }
});
test("embedded text selectors preserve strict/immediate, internal JSON, lax and stateful regex branches", () => {
  const selectors = [
    ...texts,
    '"hello"',
    '"hello"i',
    '"hello"s',
    "'hello'",
    '""',
    "/hello/i",
    "/hello/g",
    "/hello/y",
    "/a\\/b/",
    "/[/",
    "/hello/invalid",
    '"a\\nb"',
    '"\\x"',
  ];
  for (const internal of [false, true])
    for (const selector of selectors) {
      const actual = outcome(() => createTextMatcher(selector, internal));
      const expected = outcome(() => original.matcher(selector, internal));
      if (!actual.value || !expected.value) {
        assert.deepEqual(actual, expected);
        continue;
      }
      assert.equal(actual.value.kind, expected.value.kind);
      for (const full of texts)
        for (const immediate of [
          [],
          [full],
          ["other", full],
          ["hello", "world"],
        ]) {
          const text = {
            full,
            normalized: normalizeWhitespace(full),
            immediate,
          };
          // Repeat to preserve original g/y RegExp lastIndex behavior.
          for (let i = 0; i < 3; i++)
            assert.deepEqual(
              outcome(() => actual.value.matcher(text)),
              outcome(() => expected.value.matcher(text)),
              JSON.stringify({ selector, internal, text, i }),
            );
        }
    }
  assert.equal(
    createTextMatcher('"hello"', false).matcher({
      full: "hello world",
      normalized: "hello world",
      immediate: ["hello", "world"],
    }),
    true,
  );
  assert.equal(
    createTextMatcher('"hello"', true).matcher({
      full: "hello world",
      normalized: "hello world",
      immediate: ["hello", "world"],
    }),
    false,
  );
});
test("expected text assertions preserve flags, normalization, class matching, error and precedence behavior", () => {
  const patterns = [
    {},
    { string: "" },
    { string: "hello" },
    { string: "alpha beta" },
    { regexSource: "hello" },
    { regexSource: "hello", regexFlags: "gi" },
    { regexSource: "hello", regexFlags: "ii" },
    { regexSource: "[" },
    { regexSource: "hello", string: "HELLO" },
    { regexSource: "" },
  ];
  const host = {
    createStacklessError: (message: string) => new Error(message),
  };
  for (const pattern of patterns)
    for (const ignoreCase of [undefined, false, true])
      for (const normalizeWhiteSpace of [undefined, false, true])
        for (const matchSubstring of [false, true]) {
          const options = {
            ...pattern,
            ignoreCase,
            normalizeWhiteSpace,
            matchSubstring,
          };
          const actual = outcome(() => new ExpectedTextMatcher(options));
          const expected = outcome(() => new original.Expected(options));
          if (!actual.value || !expected.value) {
            assert.deepEqual(actual, expected);
            continue;
          }
          for (const text of texts) {
            for (let i = 0; i < 3; i++)
              assert.deepEqual(
                outcome(() => actual.value.matches(text)),
                outcome(() => expected.value.matches(text)),
              );
            const classes = {
              contains: (name: string) => text.split(/\s+/).includes(name),
              toString: () => text,
            };
            for (const partial of [false, true])
              assert.deepEqual(
                outcome(() =>
                  actual.value.matchesClassList(host, classes, partial),
                ),
                outcome(() =>
                  expected.value.matchesClassList(host, classes, partial),
                ),
              );
          }
        }
  assert(
    new ExpectedTextMatcher({
      string: " hello\nworld ",
      normalizeWhiteSpace: true,
    }).matches("hello world"),
  );
  assert(
    !new ExpectedTextMatcher({
      regexSource: "hello",
      regexFlags: "i",
      ignoreCase: false,
    }).matches("HELLO"),
  );
});

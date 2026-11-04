import test from "node:test";
import assert from "node:assert/strict";
import { injectedExpression } from "./injected-source";
import {
  parseAttributeSelector,
  matchesAttribute,
  InvalidSelectorError,
} from "../packages/browser/src/service/playwright/injected/attribute_selector";
const original = new Function(
  `const M = ${injectedExpression("M")}; const ve = ${injectedExpression("ve")}; const ss = ${injectedExpression("ss")}; return {parse:ve,match:ss,Error:M};`,
)();
function observe(fn: () => any) {
  try {
    return { value: fn() };
  } catch (error: any) {
    return { error: error.name, message: error.message };
  }
}
test("embedded attribute parser preserves original paths, coercion, regular expressions and exact error positions", () => {
  const corpus = new Set([
    "",
    " ",
    "button",
    "[name]",
    '["a.b".c]',
    "role[checked][name=hello]",
    "role[level=]",
    "role[level=+Infinity]",
    "role[name=/a\\/b/gi]",
    "role[name=/[a/b]/i]",
    "role[name=//]",
    "role[name=/a/v]",
    "role[name=/a/ii]",
    "role[name=/[/]",
    "role[name='a\\'b']",
    'role[name="a\\nb"]',
    "角色[名=值]",
    "role[a.b.c=true]",
    "[a..b=1]",
    "role[name!=x]",
    "role[name=/a/][checked=false] trailing",
  ]);
  for (const name of ["name", "level", "a.b", '"a.b"', "", " 名 "])
    for (const operator of ["", "=", "*=", "^=", "$=", "|=", "~=", "!="])
      for (const value of [
        "",
        "true",
        "false",
        "123",
        "-1.2",
        "+",
        "NaN",
        "word",
        '"word"i',
        '"word"S',
        "/a/i",
        "/a\\/",
      ]) {
        corpus.add(`role[${name}${operator}${value}]`);
      }
  // Reproducible malformed-token coverage catches EOF and quote/regex offset errors.
  let random = 0x12345678;
  const alphabet = "ab09[] .='\"/\\*+is\t";
  for (let i = 0; i < 2500; i++) {
    let selector = i % 2 ? "role[" : "";
    for (let j = 0; j < i % 17; j++) {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      selector += alphabet[random % alphabet.length];
    }
    corpus.add(selector);
  }
  for (const selector of corpus)
    for (const allowStrings of [false, true]) {
      assert.deepEqual(
        observe(() => parseAttributeSelector(selector, allowStrings)),
        observe(() => original.parse(selector, allowStrings)),
        JSON.stringify({ selector, allowStrings }),
      );
    }
  assert.equal(
    parseAttributeSelector("role[level=]", false).attributes[0].value,
    0,
  );
  assert.equal(
    parseAttributeSelector("role[level=]", true).attributes[0].value,
    "",
  );
  assert.deepEqual(
    parseAttributeSelector('["a.b".c]', true).attributes[0].jsonPath,
    ["a.b", "c"],
  );
  assert.throws(() => parseAttributeSelector("", false), InvalidSelectorError);
});
test("attribute matcher preserves original truthiness, case conversion, regex and space-only token matching", () => {
  const values = [
    undefined,
    null,
    false,
    true,
    0,
    1,
    NaN,
    "",
    "Alpha beta",
    "alpha\tbeta",
    "en-US",
    "İ",
    "ß",
    "SS",
    {},
    [],
  ];
  const operators = ["<truthy>", "=", "*=", "^=", "$=", "|=", "~=", "invalid"];
  for (const value of values)
    for (const expected of [...values, /alpha/gi, /alpha/y])
      for (const op of operators)
        for (const caseSensitive of [false, true]) {
          const clone = () =>
            expected instanceof RegExp
              ? new RegExp(expected.source, expected.flags)
              : expected;
          const a: any = { op, value: clone(), caseSensitive },
            b: any = { op, value: clone(), caseSensitive };
          for (let repeat = 0; repeat < 3; repeat++) {
            assert.deepEqual(
              observe(() => matchesAttribute(value, a)),
              observe(() => original.match(value, b)),
            );
            if (a.value instanceof RegExp)
              assert.equal(a.value.lastIndex, b.value.lastIndex);
          }
        }
  assert(
    matchesAttribute("en-US", { op: "|=", value: "en", caseSensitive: true }),
  );
  assert(
    !matchesAttribute("alpha\tbeta", {
      op: "~=",
      value: "beta",
      caseSensitive: true,
    }),
  );
  assert(matchesAttribute("ß", { op: "=", value: "SS", caseSensitive: false }));
});

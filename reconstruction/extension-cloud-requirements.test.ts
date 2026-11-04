import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { extensionBindings } from "./extension-source";
import { parseCloudRequirements } from "../packages/browser-extension/src/cloud_requirements";
import { parseRequestHeaders } from "../packages/browser-extension/src/request_headers";
const require = createRequire(
  new URL("../packages/browser-extension/package.json", import.meta.url),
);
const { parse } = require("smol-toml");
const source = extensionBindings(
  [
    "bg",
    "wg",
    "yg",
    "Sg",
    "te",
    "Eg",
    "Tg",
    "Ig",
    "dl",
    "Ag",
    "Os",
    "Bn",
    "Mt",
    "Cg",
    "kg",
    "Ps",
    "Rg",
    "xs",
    "Og",
    "Pg",
    "hl",
    "xg",
    "Mg",
    "fl",
    "Lg",
    "pl",
    "Dg",
    "Ng",
    "ml",
    "Ms",
    "ft",
    "se",
    "Ls",
    "tt",
    "gl",
    "_l",
    "Qt",
    "Ug",
    "Ve",
  ],
  { cs: parseRequestHeaders },
);
const result = (run: Function) => {
  try {
    return { value: run() };
  } catch (error: any) {
    return { error: error.message };
  }
};

test("pinned smol-toml parser matches actual bundled parser on policy-relevant TOML", () => {
  for (const toml of [
    "",
    "a=true",
    "a=42",
    "a=9223372036854775807",
    "a=1.5",
    "a=0xFF",
    "a=[true, false]",
    'a={b="x",c=2}',
    '[a.b]\nc="x"',
    '[[a]]\nb="x"\n[[a]]\nb="y"',
    'a="\\u4f60"',
    'a="""\nhello\nworld"""',
    "a=1979-05-27T07:32:00Z",
    "a=07:32:00",
    '"__proto__"={allow=true}',
    "a=01",
    "a=1\na=2",
    "a=[",
    "a=none",
    "[a]\n[a]",
    "a={ b={ c={ d=1 } } }",
  ]) {
    const normalize = (value: any) =>
      JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? `${v}n` : v));
    assert.equal(
      normalize(result(() => parse(toml, { integersAsBigInt: true }))),
      normalize(result(() => source.xg(toml, { integersAsBigInt: true }))),
      toml,
    );
  }
});

test("cloud requirements preserve layer validation, merge precedence and normalized policies", () => {
  const bundle = (...layers: any[]) => ({
    requirements_toml: {
      enterprise_managed: layers.map((contents) => ({ contents })),
    },
  });
  const values: any[] = [
    null,
    [],
    {},
    { requirements_toml: null },
    { requirements_toml: {} },
    { requirements_toml: { enterprise_managed: {} } },
    bundle(),
    bundle(""),
    bundle("ignored=123"),
    bundle("allow_browser_and_computer_use=true"),
    bundle("allow_browser_and_computer_use=1"),
    bundle("[browser_use]"),
    bundle("[experimental_network]"),
    bundle("[features]\na=true"),
    bundle("[features]\na=true\n[feature_requirements]\nb=false"),
    bundle(
      '[experimental_network]\nallowed_domains=["a"]\n[experimental_network.domains]\nb="deny"',
    ),
    bundle(
      '[browser_use]\nallow_webmcp=true\n[ browser_use.default_origin_policy ]\naccess="allow"\naccess_approval_lifetime="turn"',
    ),
    bundle('[browser_use.origins."https://a"]\nuploads="deny"'),
    bundle('[browser_use.origins."https://a"]\nuploads="invalid"'),
    bundle(
      "[browser_use]\nallow_webmcp=false",
      "[browser_use]\nallow_webmcp=true\nallow_history_access=true",
    ),
    bundle(
      "allow_browser_and_computer_use=true",
      'allow_browser_and_computer_use="invalid"',
    ),
    bundle(12),
    bundle("a=["),
    bundle('[features]\n"__proto__"=true'),
  ];
  for (const value of values)
    assert.deepEqual(
      result(() => parseCloudRequirements(value)),
      result(() => source.Mg(value)),
    );
  const merged = parseCloudRequirements(
    bundle(
      "[browser_use]\nallow_webmcp=false",
      "[browser_use]\nallow_webmcp=true\nallow_history_access=true",
    ),
  );
  assert.equal(merged.requirements?.browserUse?.allowWebmcp, false);
  assert.equal(merged.requirements?.browserUse?.allowHistoryAccess, true);
});

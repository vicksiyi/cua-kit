import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "acorn";
import * as tslib from "tslib";
import { createBrowserLocalizer } from "../packages/browser/src/service/localization/index";
import { browserMessages } from "../packages/browser/src/service/localization/messages";
import { serviceExpression, originalServiceBindings } from "./service-source";
import { createDiscoveryFailureReporter } from "../packages/browser/src/service/runtime/discovery_telemetry";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-service.mjs`,
  "utf8",
);
const ast = parse(source, {
  ecmaVersion: "latest",
  sourceType: "module",
}) as any;
const statement = (name: string) =>
  ast.body.find(
    (s: any) =>
      s.type === "VariableDeclaration" &&
      s.declarations.some((d: any) => d.id.name === name),
  );
const start = statement("lU"),
  end = statement("A3");
assert.ok(start && end && start.start < end.end);
const prelude = ["P8", "Zd", "R8", "I8", "k8", "B8", "G", "H", "HT", "ep"]
  .map((name) => `const ${name}=${serviceExpression(name)};`)
  .join("\n");
// Evaluate only bundled FormatJS libraries. The original tslib shim is supplied by
// the same upstream library; no browser service initializer or network code runs.
const vendor = new Function(
  "l",
  "Rt",
  "kt",
  "Pt",
  "processShim",
  prelude +
    source.slice(start.start, end.end) +
    ";return {intl:p3(),matcher:A3()};",
)(
  () => {},
  () => {},
  (value: any) => value,
  tslib,
  { env: {} },
);
const originalMessages = new Function(`return (${serviceExpression("P3")})`)();
const original = new Function(
  "nb",
  "R3",
  "I3",
  `const hue=["en-US",...Object.keys(I3)],gue=nb.createIntlCache();return (${serviceExpression("k3")});`,
)(vendor.intl, vendor.matcher, originalMessages);

test("upstream FormatJS matches original translations, locale negotiation and ICU fallback", (t) => {
  // Missing translation warnings are expected for explicit default-message cases.
  t.mock.method(console, "error", () => {});
  assert.deepEqual(browserMessages, originalMessages);
  const shared = {
    name: "测试 😀",
    url: "https://fixture.invalid/a?x=1&y=2",
    count: 2,
  };
  const descriptors = [
    {
      id: "browser.download.permission",
      defaultMessage: "Allow download from {url}?",
    },
    { id: "browser.download.sourceLabel", defaultMessage: "Download from" },
    { id: "browser.example.greeting", defaultMessage: "Hello {name}!" },
    {
      id: "missing.fixture",
      defaultMessage: "{count, plural, one {One item} other {# items}}",
    },
    {
      id: "missing.choice",
      defaultMessage: "{name, select, other {Chosen {name}}}",
    },
  ];
  for (const locale of [
    ...Object.keys(browserMessages),
    "en-US",
    "en_GB",
    "zh_CN",
    "zh",
    "zh-Hant",
    "pt",
    "es-MX",
    "fr-CA",
    "iw",
    "no",
    "invalid_locale",
    "",
  ]) {
    const expected = original(locale),
      actual = createBrowserLocalizer(locale);
    for (const descriptor of descriptors)
      assert.deepEqual(
        actual(descriptor, shared),
        expected(descriptor, shared),
        locale + ":" + descriptor.id,
      );
  }
  assert.equal(
    createBrowserLocalizer("zh_CN")(
      { id: "browser.example.greeting" },
      { name: "世界" },
    ),
    "你好，世界！",
  );
  assert.equal(
    createBrowserLocalizer()(
      { id: "missing", defaultMessage: "Hello {name}" },
      { name: "fixture" },
    ),
    "Hello fixture",
  );
  for (const locale of [null, 42, {}]) {
    assert.throws(() => createBrowserLocalizer(locale as any), TypeError);
    assert.throws(() => original(locale), TypeError);
  }
});
test("localizer preserves ICU rich text values and missing argument fallback", () => {
  const prior = console.error,
    logs: any[] = [];
  console.error = (error: any) => logs.push(error.code);
  try {
    function run(create: typeof createBrowserLocalizer) {
      const localize = create("en-US");
      const result = [
        localize(
          { id: "missing-rich", defaultMessage: "<b>{name}</b>" },
          { name: "x", b: (parts: any) => parts.join("").toUpperCase() },
        ),
        localize(
          { id: "missing-argument", defaultMessage: "Hello {name}" },
          {},
        ),
        localize({ id: "missing-no-default" }),
      ];
      return { result, logs: logs.splice(0) };
    }
    assert.deepEqual(run(createBrowserLocalizer), run(original));
  } finally {
    console.error = prior;
  }
});
test("discovery telemetry retains low-level event name and original string projection", () => {
  const expected: any[] = [],
    actual: any[] = [];
  const { Zle } = originalServiceBindings(["Zle"], {
    bh: (...args: any[]) => expected.push(args),
    Vr: "1.0.0",
  });
  const report = createDiscoveryFailureReporter((...args: any[]) => {
    actual.push(args);
  });
  for (const pipeListingError of [undefined, null, "", "fixture failure"])
    for (const reason of [
      "missing-session-metadata",
      "no-iab-backends",
      "no-session-match",
    ]) {
      const runtime: any = {
        platform: "darwin",
        env: { BROWSER_USE_DISABLE_AMBIENT_NETWORK: "1" },
      };
      const details = {
        browserCount: 2,
        candidatePipeCount: 3,
        failures: ["connect/Error", "handshake/invalid"],
        iabBrowserCount: 0,
        pipeListingPipeCount: 4,
        pipeListingError,
      };
      assert.equal(report(runtime, details, reason, 1), undefined);
      Zle(runtime, details, reason, 1);
    }
  assert.deepEqual(actual, expected);
});

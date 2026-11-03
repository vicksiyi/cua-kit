import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source.ts";
import {
  parseHostPattern,
  parseHostPatterns,
  normalizeHostname,
  wildcardMatches,
  hostPatternMatches,
  anyHostPatternMatches,
  parseOriginPattern,
  originPatternMatches,
} from "../packages/browser/dist/service/preferences/origin_patterns.js";
import { buildNetworkPolicy } from "../packages/browser/dist/service/preferences/network_config.js";
const symbols = [
  "rl",
  "sp",
  "nl",
  "ap",
  "tl",
  "Y8",
  "ip",
  "FC",
  "J8",
  "Z8",
  "MC",
  "Py",
  "Q8",
  "NC",
  "e5",
  "Ry",
  "t5",
  "Cs",
  "r5",
  "n5",
  "o5",
  "i5",
  "Iy",
];
const external = { DC: new TextEncoder(), OC: 42, X8: 63 };
const original = originalServiceBindings(symbols, external);
test("hostname parser and matching retain byte wildcards, IPv6 zones and apex distinctions", () => {
  const patterns = [
    "",
    "*",
    "**.*",
    "*.example.com",
    "**.example.com",
    "EXAMPLE.com.",
    "x?z.example",
    "a*b",
    "**bad",
    "[::1]",
    "[fe80::1%25eth0]:443",
    "[*]",
    "[bad]",
    "a/b",
    " a.com ",
    "a\u2003b",
    "例子.com",
    "?",
    "??",
  ];
  const hosts = [
    "example.com",
    "a.example.com",
    "a.b.example.com",
    "EXAMPLE.com.:443",
    "[::1]:80",
    "[fe80::1%eth0]",
    "xyz.example",
    "例子.com",
    "é",
    "ab",
    "",
  ];
  for (const pattern of patterns) {
    const parsed = parseHostPattern(pattern);
    assert.deepEqual(parsed, original.rl(pattern));
    for (const host of hosts) {
      assert.equal(wildcardMatches(pattern, host), original.Py(pattern, host));
      assert.equal(normalizeHostname(host), original.tl(host));
      if (parsed)
        assert.equal(
          hostPatternMatches(parsed, host),
          original.nl(original.rl(pattern), host),
        );
    }
  }
  assert.equal(wildcardMatches("?", "é"), false);
  assert.equal(wildcardMatches("??", "é"), true);
  for (const allowGlobalWildcard of [false, true])
    for (const values of [
      ["A.com", "a.com."],
      ["**.*"],
      ["*.example.com", "bad/path"],
      [],
    ]) {
      const parsed = parseHostPatterns(values, { allowGlobalWildcard });
      assert.deepEqual(parsed, original.sp(values, { allowGlobalWildcard }));
      if (parsed)
        assert.equal(
          anyHostPatternMatches(parsed, "a.com"),
          original.ap(parsed, "a.com"),
        );
    }
});
test("origin pattern parsing normalizes ports and IDNs while preserving rejection boundaries", () => {
  const patterns = [
    "https://EXAMPLE.com:443",
    "http://example.com:80",
    "https://example.com:80",
    "https://*.example.com",
    "https://**.example.com",
    "https://?.例子.com",
    "https://例?.com",
    "https://例子.com",
    "https://[::1]:443",
    "https://a.com/",
    "https://a.com#x",
    "https://u@a.com",
    " https://a.com",
    "https://a..com",
    "https://a.com..",
    "https://a.com.",
    "https://a.com:bad",
    "https://a.com:99999",
    "https://%61.com",
    "codex-sandbox://*.web-sandbox.oaiusercontent.com",
    "https://*",
    "https://a?b.com",
    "https://a.com?x",
  ];
  const urls = [
    "https://example.com",
    "https://a.example.com",
    "http://example.com",
    "https://example.com:80",
    "https://axb.com",
    "https://[::1]",
    "https://a.例子.com",
  ];
  for (const value of patterns) {
    const pattern = parseOriginPattern(value);
    assert.deepEqual(pattern, original.Cs(value), value);
    if (pattern)
      for (const url of urls)
        assert.equal(
          originPatternMatches(pattern, new URL(url)),
          original.Iy(original.Cs(value), new URL(url)),
        );
  }
});
test("network constraints use real reconstructed canonical parser for duplicate allow exclusion", () => {
  const source = originalServiceBindings(
    [
      ...symbols,
      "fS",
      "Doe",
      "Ooe",
      "Moe",
      "Noe",
      "Foe",
      "fL",
      "$c",
      "yg",
      "Loe",
      "hL",
      "dL",
      "gL",
      "Uoe",
    ],
    external,
  );
  const requirements = {
    requirements: {
      browserUse: {
        defaultOriginPolicy: { access: "deny" },
        origins: {
          "https://EXAMPLE.com:443": { access: "allow" },
          "https://example.com": { access: "allow" },
          "https://例子.com": { access: "allow" },
          "https://xn--fsqu00a.com": { access: "allow" },
          "https://*.unique.com": { access: "allow" },
          "https://denied.com": { access: "deny" },
        },
      },
    },
  };
  const actual = buildNetworkPolicy({ type: "dangerFullAccess" }, requirements);
  assert.deepEqual(
    actual,
    source.gL({ type: "dangerFullAccess" }, requirements),
  );
  assert.deepEqual(
    actual.constraints.find(
      (item) => item.kind === "origins" && item.mode === "allowlist",
    )?.patterns,
    ["https://*.unique.com"],
  );
});

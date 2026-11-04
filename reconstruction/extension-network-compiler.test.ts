import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  parseHostPattern,
  parseOriginPattern,
  hostPatternMatches,
} from "@core/core/originPatterns";
import {
  compileNetworkPolicy,
  createNetworkPolicyPredicate,
  type NetworkPolicyConstraint,
} from "../packages/browser-extension/src/network_policy_compiler";
const original = extensionBindings(
  [
    "rc",
    "nc",
    "lp",
    "ic",
    "up",
    "Sn",
    "dp",
    "En",
    "sc",
    "hp",
    "ac",
    "ss",
    "fp",
    "oc",
    "pp",
    "as",
    "mp",
    "gp",
    "_p",
    "vp",
    "bp",
    "wp",
    "$e",
    "Me",
    "hs",
    "Up",
    "$p",
    "wc",
    "Fp",
    "Bp",
    "jp",
    "qp",
    "kn",
    "yc",
    "Sc",
    "Ec",
    "Rn",
    "kt",
    "Hp",
    "Gp",
    "Tc",
    "Ic",
    "zp",
    "Vp",
    "Wp",
    "Ac",
    "Cc",
    "kc",
    "Rc",
  ],
  {},
);
function result(fn: () => unknown) {
  try {
    return { value: fn() };
  } catch (error: any) {
    return { error: error.message };
  }
}
const policy = (
  patterns: string[],
  mode: "allowlist" | "denylist" = "allowlist",
  kind: "domains" | "origins" = "domains",
): NetworkPolicyConstraint => ({ patterns, mode, kind });
test("shared origin/host parser matches the extension closure, including IDN, wildcard, IP and port cases", () => {
  const hosts = [
    "",
    "*",
    "**",
    "*.example.com",
    "**.Example.COM.",
    "é.com",
    "a?b",
    "a**b",
    "127.0.0.1",
    "01.2.3.4",
    "[::1]:80",
    "[fe80::1%25eth0]",
    "[*]",
    "a/b",
    "a\\b",
    "a b",
    " a.com ",
    "\u0085a.com\u0085",
    "a\0b",
    "a..b",
    "a..",
    "[::1]x",
    "a:99",
  ];
  for (const host of hosts) {
    assert.deepEqual(parseHostPattern(host), original.ic(host), host);
    for (const protocol of ["https://", "http://", "file://", "custom://"]) {
      const value = protocol + host;
      assert.deepEqual(parseOriginPattern(value), original.gp(value), value);
    }
    const parsed = parseHostPattern(host);
    if (parsed)
      for (const candidate of hosts)
        assert.equal(
          hostPatternMatches(parsed, candidate),
          original.up(parsed, candidate),
        );
  }
});
test("compiler matches exact original normalized rules and URL predicate across mixed policies", () => {
  const samples: NetworkPolicyConstraint[][] = [
    [],
    [policy([])],
    [policy([], "denylist")],
    [policy(["*"])],
    [
      policy(["**.example.com"]),
      policy(["*.example.com"]),
      policy(["blocked.example.com"], "denylist"),
    ],
    [
      policy(
        ["https://example.com", "http://example.com"],
        "allowlist",
        "origins",
      ),
      policy(["example.com"]),
    ],
    [
      policy(["https://example.com/path?q=1#x"], "allowlist", "origins"),
      policy(["**.example.com"]),
    ],
    [policy(["data:text/plain,hello#x"], "denylist", "origins")],
    [policy(["https://[::1]:8080"], "allowlist", "origins")],
    [policy(["a?b", "*.com", "*.com"]), policy(["*b", "x.com"])],
    [policy(["x.com"]), policy(["x.com"])],
    [
      policy(["https://x.com"], "allowlist", "origins"),
      policy(["http://x.com"], "allowlist", "origins"),
    ],
  ];
  for (const pattern of [
    "",
    "x/y",
    "a b",
    "é.com",
    "https://?*.example.com",
    "https://例子.com",
    "https://é*.com",
    "https://user:pass@example.com/path",
    "file:///tmp/a",
    "https://example.com:443",
    "[fe80::1%zone]",
    "a\0b",
    "https://a.com/",
    "http://a.com?x",
  ])
    for (const kind of ["domains", "origins"] as const)
      samples.push([policy([pattern], "allowlist", kind)]);
  const urls = [
    "https://example.com",
    "https://a.example.com/",
    "https://blocked.example.com",
    "http://example.com/path?x#y",
    "https://example.com/path?new#new",
    "https://[::1]:8080/a",
    "data:text/plain,hello#new",
    "file:///tmp/a",
    "https://ab",
    "https://x.com.",
    "invalid",
  ];
  for (const input of samples) {
    assert.deepEqual(
      result(() => compileNetworkPolicy(input)),
      result(() => original.Vp(input)),
      JSON.stringify(input),
    );
    for (const url of urls)
      assert.deepEqual(
        result(() => createNetworkPolicyPredicate(input)(url)),
        result(() => original.Wp(input)(url)),
        JSON.stringify({ input, url }),
      );
  }
  assert.equal(
    createNetworkPolicyPredicate([
      policy(["**.example.com"]),
      policy(["blocked.example.com"], "denylist"),
    ])("https://blocked.example.com/"),
    false,
  );
  assert.deepEqual(compileNetworkPolicy([policy([])]), {
    defaultAction: "block",
    rules: [],
  });
});
test("compiler preserves original budget limits before normalization/deduplication", () => {
  const cases = [
    Array.from({ length: 129 }, () => policy([])),
    [policy(Array(4097).fill("x"))],
    [policy(["a".repeat(65537)])],
    [policy(Array(4096).fill("x"))],
    [policy(["?".repeat(513)])],
    [
      policy(
        Array.from({ length: 1000 }, (_, i) => `host${i}.com`),
        "denylist",
      ),
    ],
    [
      policy(Array.from({ length: 65 }, (_, i) => `a${i}*`)),
      policy(Array.from({ length: 65 }, (_, i) => `*b${i}`)),
    ],
  ];
  for (const input of cases)
    assert.deepEqual(
      result(() => compileNetworkPolicy(input)),
      result(() => original.Vp(input)),
    );
});

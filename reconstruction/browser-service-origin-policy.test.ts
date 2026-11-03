import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source.ts";
import {
  resolveOriginPolicy,
  readOriginPolicy,
  networkPolicyDecision,
  isOriginBlockedByPolicy,
  parsePolicyOrigin,
} from "../packages/browser/dist/service/preferences/origin_policy.js";
const original = originalServiceBindings(
  [
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
    "LC",
    "up",
    "Es",
    "cL",
    "uL",
    "lL",
    "es",
    "Gc",
    "pL",
    "mL",
    "QC",
    "l5",
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
  ],
  { DC: new TextEncoder(), OC: 42, X8: 63 },
);
test("origin permissions retain restrictive precedence, duplicate handling and local projection", () => {
  const managedCases = [
    undefined,
    { defaultOriginPolicy: { access: "deny" } },
    {
      origins: {
        "https://**.example.com": {
          access: "allow",
          uploads: "deny",
          persistentApproval: false,
          accessApprovalLifetime: "turn",
        },
      },
    },
    {
      defaultOriginPolicy: { downloads: "deny" },
      origins: {
        "https://example.com": { downloads: "allow" },
        "https://EXAMPLE.com:443": null,
      },
    },
    {
      origins: { "https://example.com": { access: "deny", uploads: "allow" } },
    },
  ];
  const localCases = [
    undefined,
    { default_origin_policy: { access: "deny" } },
    {
      origins: {
        "https://example.com": {
          access: "allow",
          downloads: "deny",
          full_cdp_access: "deny",
          autoReview: "deny",
          persistentApproval: false,
        },
      },
    },
    {
      origins: {
        "https://example.com": { access: "allow" },
        "https://EXAMPLE.com:443": { access: "deny" },
      },
    },
  ];
  for (const managed of managedCases)
    for (const local of localCases)
      for (const origin of [
        "https://example.com/a",
        "https://child.example.com",
        "http://example.com",
        "file:///tmp/a",
        "invalid",
        "codex-sandbox://a.web-sandbox.oaiusercontent.com",
      ])
        assert.deepEqual(
          resolveOriginPolicy(managed as any, local as any, origin),
          original.cL(managed, local, origin),
        );
  for (const origin of [
    "http://a",
    "file:///tmp/a",
    "codex-sandbox://a.web-sandbox.oaiusercontent.com",
    "codex-sandbox://bad.com",
    "codex-sandbox://u@a.web-sandbox.oaiusercontent.com",
    "codex-sandbox://a.web-sandbox.oaiusercontent.com:80",
  ])
    assert.equal(
      parsePolicyOrigin(origin)?.href ?? null,
      original.up(origin)?.href ?? null,
    );
});
test("network decisions fail closed on malformed host rules and preserve non-HTTP boundary", () => {
  for (const enabled of [null, false, true])
    for (const hardDenyAllowlistMisses of [false, true])
      for (const deniedDomains of [[], ["*.example.com"], ["*"], ["bad/path"]])
        for (const allowedDomains of [
          [],
          ["**.example.com"],
          ["*"],
          ["bad/path"],
        ]) {
          const network = {
            enabled,
            hardDenyAllowlistMisses,
            deniedDomains,
            allowedDomains,
          };
          for (const url of [
            "https://example.com",
            "https://a.example.com",
            "https://other.com",
            "file:///tmp/a",
            "invalid",
          ])
            assert.equal(
              networkPolicyDecision(url, network),
              original.QC(url, network),
            );
        }
});
test("config policy reads start concurrently and network blocks take precedence over origin grants", async () => {
  async function run(fn: any, origin: string, reject = false) {
    const trace: string[] = [],
      gate = Promise.withResolvers<any>();
    const requirements = {
      requirements: {
        network: { deniedDomains: ["**.example.com"] },
        browserUse: { origins: { "https://example.com": { access: "allow" } } },
      },
    };
    const pending = fn(origin, {
      readRequirements() {
        trace.push("requirements");
        return gate.promise;
      },
      async readAll() {
        trace.push("all");
        return { config: {} };
      },
    });
    assert.deepEqual(trace, ["requirements", "all"]);
    if (reject) gate.reject(Error("read failure"));
    else gate.resolve(requirements);
    try {
      return { trace, value: await pending };
    } catch (error: any) {
      return { trace, error: error.message };
    }
  }
  for (const origin of [
    "https://example.com",
    "codex-sandbox://example.com",
    "https://other.com",
  ])
    for (const reject of [false, true]) {
      assert.deepEqual(
        await run(readOriginPolicy, origin, reject),
        await run(original.Gc, origin, reject),
      );
      assert.deepEqual(
        await run(isOriginBlockedByPolicy, origin, reject),
        await run(original.pL, origin, reject),
      );
    }
});

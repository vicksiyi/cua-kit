import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source.ts";
import {
  effectiveNetworkConfig,
  selectedNetworkConfig,
  createNetworkPolicyBuilder,
} from "../packages/browser/dist/service/preferences/network_config.js";
// The parser is an explicit fixture: these tests verify composition, not Cs parsing.
const parser = (value: string) =>
  value === "bad"
    ? null
    : { canonicalKey: value.toLowerCase().replace(":443", "") };
const original = originalServiceBindings(
  [
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
  { Cs: parser },
);
const build = createNetworkPolicyBuilder(parser);
function config(network: any, selected: any = " default ") {
  return {
    config: {
      default_permissions: selected,
      permissions: { default: { network } },
    },
  };
}
test("network requirements merge retains managed-only restrictions, sticky denial and field precedence", () => {
  const managedCases = [
    undefined,
    {},
    { enabled: false },
    { enabled: true },
    {
      managedAllowedDomainsOnly: true,
      allowedDomains: ["managed", "duplicate"],
      deniedDomains: ["blocked"],
    },
    {
      domains: { managed: "allow", blocked: "deny", ignored: "unexpected" },
      allowedDomains: ["ignored"],
    },
  ];
  const localCases = [
    undefined,
    null,
    [],
    {},
    {
      enabled: true,
      allowed_domains: ["local", "duplicate", 3],
      denied_domains: ["blocked", "local-blocked"],
    },
    { enabled: false },
    { enabled: "true", allowedDomains: [], allowed_domains: ["ignored"] },
    { domains: {}, allowed_domains: ["ignored"] },
    { domains: [], allowed_domains: ["fallback"] },
    { domains: { blocked: "allow", local: "deny" } },
  ];
  for (const managed of managedCases)
    for (const local of localCases) {
      const requirements = { requirements: { network: managed } },
        snapshot = config(local);
      const before = structuredClone({ requirements, snapshot });
      assert.deepEqual(
        effectiveNetworkConfig(requirements, snapshot),
        original.fS(requirements, snapshot),
      );
      assert.deepEqual({ requirements, snapshot }, before);
    }
  for (const selected of [null, 1, "", "   ", "missing", " default "])
    assert.deepEqual(
      selectedNetworkConfig(config({ enabled: true }, selected)),
      original.Doe(config({ enabled: true }, selected)),
    );
});
test("network policy composition retains constraint order, origin expansion and canonical collision exclusion", () => {
  const requirements = {
    requirements: {
      network: {
        managedAllowedDomainsOnly: true,
        allowedDomains: ["managed"],
        deniedDomains: ["blocked"],
      },
      browserUse: {
        defaultOriginPolicy: { access: "deny" },
        origins: {
          "https://A.com": { access: "allow" },
          "https://a.com:443": { access: "allow" },
          "https://b.com": { access: "allow" },
          bad: { access: "deny" },
        },
      },
    },
  };
  const snapshot = {
    ...config({ enabled: true, allowed_domains: ["must-not-expand"] }),
    config: {
      ...config({ enabled: true, allowed_domains: ["must-not-expand"] }).config,
      browser_use: {
        default_origin_policy: { access: "deny" },
        origins: {
          "https://c.com": { access: "deny" },
          "https://d.com": { access: "allow" },
        },
      },
    },
  };
  const denied = [
    " example.com ",
    "example.com:443",
    "https://a.com",
    "file:///tmp/a",
    "codex-sandbox://host",
    "localhost:8080",
    "",
    "mailto:a",
  ];
  for (const sandbox of [
    { type: "dangerFullAccess" },
    { type: "readOnly", networkAccess: false },
    { type: "workspaceWrite", networkAccess: true },
    { type: "externalSandbox", networkAccess: "enabled" },
    { type: "externalSandbox", networkAccess: "disabled" },
    { type: "unknown" },
  ])
    assert.deepEqual(
      build(sandbox, requirements, snapshot, denied),
      original.gL(sandbox, requirements, snapshot, denied),
    );
  assert.throws(
    () => build(null),
    /Effective sandbox network policy is unavailable/,
  );
  assert.deepEqual(
    build({ type: "dangerFullAccess" }),
    original.gL({ type: "dangerFullAccess" }),
  );
});

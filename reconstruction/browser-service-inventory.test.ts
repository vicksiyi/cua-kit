import test from "node:test";
import assert from "node:assert/strict";
import {
  originalServiceBindings,
  serviceAssignment,
  serviceExpression,
  serviceSourceSha256,
} from "./service-source.ts";
import * as filtering from "../packages/browser/src/service/capability_filter";
import * as info from "../packages/browser/src/service/browser_info";
import * as handlers from "../packages/browser/src/service/commands/browser_inventory";
if (
  serviceSourceSha256 !==
  "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021"
)
  throw Error(
    "Browser inventory source changed; re-audit helper bindings before comparison",
  );
const original = originalServiceBindings(
  [
    "mc",
    "B_",
    "Of",
    "oD",
    "Ea",
    "Nf",
    "D_",
    "Cx",
    "Ho",
    "Ax",
    "Px",
    "Ix",
    "Rx",
    "kx",
    "Bx",
  ],
  {
    OR: "BROWSER_USE_DISABLE_BROWSER_CAPABILITIES",
    NR: "BROWSER_USE_DISABLE_TAB_CAPABILITIES",
    MR: "BROWSER_USE_DISABLE_API_MEMBERS",
    In: { id: "browserAuth" },
    YB: () => {
      throw Error("Feature-gated siwc is outside this inventory fixture");
    },
    vv: () => {
      throw Error("Feature preparation is outside this inventory fixture");
    },
  },
);
const oe = {
  GetBrowser: { commandType: "get_browser" },
  GetDefaultBrowser: { commandType: "get_default_browser" },
  GetBrowserDocumentation: { commandType: "get_browser_documentation" },
  GetDocumentation: { commandType: "get_documentation" },
  GetBrowserForUrl: { commandType: "get_browser_for_url" },
  ListBrowsers: { commandType: "list_browsers" },
};
for (const name of ["Ax", "Px", "Ix", "Rx", "kx", "Bx"])
  new Function(name, "ee", serviceAssignment(name + ".type"))(
    original[name],
    oe,
  );
const registry = new Function(
  "ee",
  ...Object.keys(original),
  "return " + serviceExpression("p6"),
)(oe, ...Object.values(original));
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error: { name: error.name, message: error.message } };
  }
}
test("non-feature-gated capability filters preserve reference identity, env parsing and disabled-member rules", () => {
  const capabilities = {
    browser: [{ id: "a" }, { id: "b" }],
    tab: [{ id: "browserAuth" }, { id: "cdp" }],
  };
  for (const value of [undefined, "", " a, a, b, ", "browserAuth", 1, null]) {
    const runtime = {
      env: {
        BROWSER_USE_DISABLE_BROWSER_CAPABILITIES: value,
        BROWSER_USE_DISABLE_TAB_CAPABILITIES: value,
        BROWSER_USE_DISABLE_API_MEMBERS: value,
      },
    };
    const ours = filtering.availableCapabilities(runtime, capabilities),
      theirs = original.Ea(runtime, { capabilities });
    assert.deepEqual(ours, theirs);
    assert.equal(
      ours.browser === capabilities.browser,
      theirs.browser === capabilities.browser,
    );
    assert.equal(
      ours.tab === capabilities.tab,
      theirs.tab === capabilities.tab,
    );
    assert.deepEqual(
      filtering.disabledApiMembers(runtime),
      original.Nf(runtime),
    );
  }
  assert.deepEqual(
    filtering.availableCapabilities({ env: {} }, undefined),
    original.Ea({ env: {} }, {}),
  );
});
test("browser info projection and CDP handoff overrides follow effective capability filtering", async () => {
  for (const type of ["extension", "iab", "mcpapps", "cdp", "unknown"])
    for (const disabled of ["", "browserAuth"])
      for (const metadata of [
        undefined,
        {
          profileName: "p",
          extensionInstanceId: "ext",
          codexSessionId: "session",
          privateField: "omitted",
        },
      ]) {
        const runtime = {
            env: { BROWSER_USE_DISABLE_TAB_CAPABILITIES: disabled },
          },
          record = {
            family: "chromium",
            name: "Browser",
            type,
            metadata,
            capabilities: { tab: [{ id: "browserAuth" }] },
            apiSupportOverrides: {
              "Tab.requestManualHandoff": false,
              "Tab.requestUserTakeover": false,
              other: true,
            },
          };
        assert.deepEqual(
          info.browserSummary("b", record),
          original.Cx("b", record),
        );
        assert.deepEqual(
          await info.browserDetails(runtime, "b", record),
          await original.Ho(runtime, "b", record),
        );
      }
});
async function scenario(table: any, fail?: string) {
  const calls: any[] = [];
  const record = {
    id: "canonical",
    info: {
      type: "cdp",
      name: "Browser",
      capabilities: { tab: [{ id: "browserAuth" }] },
    },
  };
  const context = {
    async refresh() {
      calls.push("refresh");
      if (fail === "refresh") throw new Error("refresh failed");
    },
    async get(id: any) {
      calls.push(["get", id]);
      if (fail === "get") throw new Error("get failed");
      return record;
    },
    async getForUrl(url: any) {
      calls.push(["url", url]);
      return record;
    },
    async getDefault() {
      calls.push("default");
      return record;
    },
    list() {
      calls.push("list");
      return ["raw"];
    },
  };
  const runtime = { env: {} },
    documentation = {
      async read(name: any) {
        calls.push(["read", name]);
        return "docs";
      },
      async readBrowser(value: any) {
        calls.push(["browserDocs", value]);
        return "browser docs";
      },
    };
  const results = [];
  for (const command of Object.values(table) as any[]) {
    assert.equal(typeof command.type, "string");
    results.push(
      await outcome(() =>
        command(
          {
            id: "alias",
            browser_id: "alias",
            url: "https://example.com",
            name: "intro",
          },
          context,
          runtime,
          documentation,
        ),
      ),
    );
  }
  return { keys: Object.keys(table), calls, results };
}
test("six global inventory commands preserve refresh order, projections, raw list and lookup failures", async () => {
  for (const failure of [undefined, "refresh", "get"])
    assert.deepEqual(
      await scenario(handlers.browserInventoryCommands, failure),
      await scenario(registry, failure),
    );
});

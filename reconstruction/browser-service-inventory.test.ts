import test from "node:test";
import assert from "node:assert/strict";
import {
  originalServiceBindings,
  serviceAssignment,
  serviceExpression,
} from "./service-source.ts";
import * as filtering from "../packages/browser/dist/service/capability_filter.js";
import * as info from "../packages/browser/dist/service/browser_info.js";
import * as handlers from "../packages/browser/dist/service/commands/browser_inventory.js";
const original = originalServiceBindings(
  [
    "hC",
    "gC",
    "fC",
    "dl",
    "jy",
    "CA",
    "AA",
    "yp",
    "wp",
    "Hy",
    "Sx",
    "Go",
    "xx",
    "Ex",
    "Tx",
    "Cx",
    "Ax",
    "Px",
  ],
  { On: { id: "browserAuth" } },
);
const oe = {
  GetBrowser: { commandType: "get_browser" },
  GetDefaultBrowser: { commandType: "get_default_browser" },
  GetBrowserDocumentation: { commandType: "get_browser_documentation" },
  GetDocumentation: { commandType: "get_documentation" },
  GetBrowserForUrl: { commandType: "get_browser_for_url" },
  ListBrowsers: { commandType: "list_browsers" },
};
for (const name of ["xx", "Ex", "Tx", "Cx", "Ax", "Px"])
  new Function(name, "oe", serviceAssignment(name + ".type"))(
    original[name],
    oe,
  );
const registry = new Function(
  "oe",
  ...Object.keys(original),
  "return " + serviceExpression("c6"),
)(oe, ...Object.values(original));
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error: { name: error.name, message: error.message } };
  }
}
test("service capability filters preserve reference identity, env parsing and disabled-member rules", () => {
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
      theirs = original.yp(runtime, capabilities);
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
      original.wp(runtime),
    );
  }
  assert.deepEqual(
    filtering.availableCapabilities({ env: {} }, undefined),
    original.yp({ env: {} }, undefined),
  );
});
test("browser info projection and CDP handoff overrides follow effective capability filtering", () => {
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
          original.Sx("b", record),
        );
        assert.deepEqual(
          info.browserDetails(runtime, "b", record),
          original.Go(runtime, "b", record),
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

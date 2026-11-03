import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  PageAssetsTabCapability,
  pageAssetsTabCapabilityDefinition,
} from "../packages/browser/dist/capabilities/tab_page_assets.js";
import {
  TabWebMcpCapability,
  toWebMcpToolDescriptor,
  webMcpTabCapabilityInfo,
} from "../packages/browser/dist/capabilities/tab_web_mcp.js";
import {
  PageAssetsList,
  PageAssetsBundle,
} from "../packages/browser/dist/commands/page_assets.js";
import {
  WebMcpListTools,
  WebMcpInvokeTool,
} from "../packages/browser/dist/commands/web_mcp.js";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
  "utf8",
);
const original = await import(
  `data:text/javascript;base64,${Buffer.from(source + "\nexport {mh,ph,yh,bh,_h,Ku,ch,Ca,$a};").toString("base64")}`
);
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (e) {
    return { error: { name: e.name, message: e.message } };
  }
}
const inventory = {
  assets: [
    {
      id: "a",
      kind: "image",
      name: "Image",
      sources: [{ kind: "attribute", nodeId: 1, property: "src", extra: 1 }],
      url: "https://example.test/a",
      extra: 1,
    },
  ],
  id: "inventory",
  inlineSvgs: [{ id: "svg", markup: "<svg/>", name: "icon" }],
  pageUrl: null,
  summary: { byKind: { image: 1 }, inlineSvgCount: 1, totalCount: 2 },
  extra: 1,
};
const bundleResult = {
  assets: [
    {
      contentType: null,
      id: "a",
      kind: "image",
      name: "Image",
      path: "/tmp/a",
      url: "url",
    },
  ],
  directoryPath: "/tmp/bundle",
  failures: [
    { contentType: null, id: "b", name: "B", reason: "missing", url: "url" },
  ],
  manifestPath: "/tmp/manifest",
  summary: {
    downloadedCount: 1,
    elapsedMs: 0.5,
    failedCount: 1,
    requestedCount: 2,
  },
  extra: 1,
};

test("page assets preserves target override order, raw bundle inputs and parsed inventory/artifact results", async () => {
  assert.deepEqual(pageAssetsTabCapabilityDefinition.info, original.ph.info);
  async function run(Class: any, method: string, args: any[], response: any) {
    const log: any[] = [];
    const api = new Class({
      browserId: "b",
      tabId: "t",
      documentation: {},
      info: { id: "assets", description: "d" },
      transport: {
        send: async ({ command }: any) => {
          log.push(command.toJSON());
          return response;
        },
      },
    });
    return { result: await outcome(() => api[method](...args)), log };
  }
  for (const method of ["list", "bundle"])
    for (const options of [
      undefined,
      null,
      {},
      {
        inventoryId: "inventory",
        assetIds: ["a"],
        kinds: ["image"],
        browser_id: "override",
        tab_id: "override",
        extra: 1,
      },
    ])
      for (const response of [inventory, bundleResult, {}, null])
        assert.deepEqual(
          await run(PageAssetsTabCapability, method, [options], response),
          await run(original.mh, method, [options], response),
        );
});
const tool = {
  name: "actual",
  call_name: "alias",
  registration_id: "r1",
  title: "Tool",
  description: "desc",
  input_schema: { type: "object" },
  annotations: { readOnlyHint: true },
  origin: "https://example.test",
  pageUrl: "https://example.test/page",
  extra: 1,
};

test("WebMCP descriptors and frozen tool snapshots preserve exact descriptions, aliases, duplicates and invocation payloads", async () => {
  assert.deepEqual(webMcpTabCapabilityInfo, original.bh);
  for (const input of [
    tool,
    { name: "n", call_name: "c", input_schema: null },
    {
      ...tool,
      title: null,
      description: null,
      annotations: null,
      origin: null,
      pageUrl: null,
    },
  ])
    assert.deepEqual(toWebMcpToolDescriptor(input as any), original._h(input));
  async function run(Class: any, tools: any[]) {
    const log: any[] = [];
    let listCount = 0;
    const api = new Class({
      browserId: "b",
      tabId: "t",
      documentation: {},
      info: { id: "webmcp", description: "d" },
      transport: {
        send: async ({ command }: any) => {
          const payload = command.toJSON();
          log.push(payload);
          if (payload.type === "webmcp_list_tools")
            return {
              tools:
                listCount++ === 0
                  ? tools
                  : [{ ...tool, registration_id: "new-registration" }],
            };
          return {
            result: {
              registration: payload.registration_id,
              input: payload.input,
            },
          };
        },
      },
    });
    const snapshot = await api.fetchTools();
    const description = snapshot.description();
    const calls = [];
    for (const name of ["alias", " alias ", "missing", ""])
      for (const timeoutMs of [undefined, null, 0, 50])
        calls.push(
          await outcome(() => snapshot.call(name, { value: 1 }, { timeoutMs })),
        );
    const newer = await api.fetchTools();
    calls.push(await outcome(() => snapshot.call("alias", {})));
    calls.push(await outcome(() => newer.call("alias", {})));
    return {
      log,
      description,
      calls,
      frozen: Object.isFrozen(snapshot),
      keys: Object.keys(snapshot),
      descriptionStable: snapshot.description() === description,
    };
  }
  for (const tools of [
    [],
    [tool],
    [tool, { ...tool, name: "second", registration_id: "r2" }],
    [
      {
        ...tool,
        title: undefined,
        description: undefined,
        input_schema: undefined,
      },
    ],
  ])
    assert.deepEqual(
      await run(TabWebMcpCapability, tools),
      await run(original.yh, tools),
    );
});

test("page-assets and WebMCP schemas retain constraints, optional metadata, projection and raw command creation", async () => {
  const pairs = [
    [PageAssetsBundle, original.Ku],
    [PageAssetsList, original.ch],
    [WebMcpListTools, original.Ca],
    [WebMcpInvokeTool, original.$a],
  ];
  const inputs = [
    undefined,
    null,
    {},
    [],
    inventory,
    bundleResult,
    {
      ...inventory,
      summary: { byKind: { unknown: 1 }, inlineSvgCount: -1, totalCount: 1 },
    },
    {
      browser_id: "b",
      tab_id: "t",
      inventoryId: "i",
      assetIds: [],
      kinds: ["script"],
    },
    {
      browser_id: "b",
      tab_id: "t",
      tool_name: "n",
      registration_id: "r",
      input: null,
      timeout_ms: 0,
    },
    { tools: [tool] },
    { tools: [{ ...tool, registration_id: undefined }] },
    { result: null },
  ];
  for (const [restored, vendor] of pairs)
    for (const input of inputs) {
      assert.deepEqual(
        await outcome(() => restored.create(input).parse()),
        await outcome(() => vendor.create(input).parse()),
      );
      assert.deepEqual(
        await outcome(() => restored.create(input).toJSON()),
        await outcome(() => vendor.create(input).toJSON()),
      );
      assert.deepEqual(
        await outcome(() => restored.ResultSchema.parse(input)),
        await outcome(() => vendor.ResultSchema.parse(input)),
      );
    }
});

test("WebMCP invalid non-string call names retain native TypeError apart from the renamed identifier", async () => {
  async function fail(Class: any) {
    const api = new Class({
      browserId: "b",
      tabId: "t",
      documentation: {},
      info: {},
      transport: { send: async () => ({ tools: [tool] }) },
    });
    const tools = await api.fetchTools();
    return outcome(() => tools.call(3, {}));
  }
  const actual = await fail(TabWebMcpCapability),
    expected = await fail(original.yh);
  if (actual.error)
    actual.error.message = actual.error.message.replace(
      "name.trim",
      "<name>.trim",
    );
  if (expected.error)
    expected.error.message = expected.error.message.replace(
      "e.trim",
      "<name>.trim",
    );
  assert.deepEqual(actual, expected);
});

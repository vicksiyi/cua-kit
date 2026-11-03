import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source.ts";
import {
  discoverPageAssets,
  discoverInlineSvgs,
  assetId,
  assetKindFromUrl,
} from "../packages/browser/dist/service/context/asset_discovery.js";
const symbols = [
  "KF",
  "XF",
  "YF",
  "moe",
  "foe",
  "hoe",
  "goe",
  "Lo",
  "$F",
  "boe",
  "GF",
  "yoe",
  "JF",
  "VF",
  "fg",
  "zF",
  "ZF",
  "Hc",
  "woe",
  "QF",
  "_oe",
  "voe",
  "mS",
  "Wc",
];
const original = originalServiceBindings(symbols);
function snapshot() {
  const strings: string[] = [];
  const str = (value: string) => {
    strings.push(value);
    return strings.length - 1;
  };
  const nodes = {
    backendNodeId: [] as number[],
    nodeName: [] as number[],
    attributes: [] as number[][],
  };
  for (const [tag, attrs] of [
    ["img", { src: "/a", srcset: "/a 1x, /missing.png 2x" }],
    ["source", { src: "/movie", srcset: "/a 1x" }],
    ["video", { src: "/movie", poster: "/a" }],
    ["script", { src: "/code" }],
    ["link", { href: "/style", rel: "stylesheet" }],
    ["use", { href: "/sprite.svg#icon", "xlink:href": "/sprite.svg#icon" }],
  ] as Array<[string, Record<string, string>]>) {
    nodes.backendNodeId.push(nodes.backendNodeId.length + 1);
    nodes.nodeName.push(str(tag.toUpperCase()));
    nodes.attributes.push(
      Object.entries(attrs).flatMap(([key, value]) => [str(key), str(value)]),
    );
  }
  nodes.backendNodeId.push(0);
  nodes.nodeName.push(-1);
  nodes.attributes.push([]);
  return {
    strings,
    documents: [
      {
        documentURL: str("https://example.com/page"),
        nodes,
        layout: {
          nodeIndex: [0, 6],
          styles: [[str('url("/a"), url(/missing.png)')], []],
        },
      },
    ],
  };
}
test("asset discovery preserves performance-only membership, enrichment order and missing-document duplicate behavior", async () => {
  async function run(fn: any, missing: boolean) {
    const trace: any[] = [],
      data = snapshot();
    if (missing) data.documents = [];
    const resources = [
      { name: "https://example.com/a" },
      { name: "https://example.com/a" },
      { name: "https://example.com/movie" },
      { name: "https://example.com/code" },
      { name: "https://example.com/style" },
      { name: "https://example.com/sprite.svg#icon" },
      { name: "https://example.com/font.woff2?x=1", initiatorType: "css" },
      { name: "" },
    ];
    const result = await fn({
      tabId: 1,
      cdp: {
        call: async (...args: any[]) => {
          trace.push(args);
          return data;
        },
        evaluateJavascript: async (...args: any[]) => {
          trace.push(args);
          return resources;
        },
      },
    });
    return { trace, result };
  }
  for (const missing of [false, true]) {
    const actual = await run(discoverPageAssets, missing);
    assert.deepEqual(actual, await run(original.XF, missing));
    assert.equal(
      actual.result.some((asset: any) => asset.url.includes("missing")),
      false,
    );
    assert.equal(
      actual.result.filter((asset: any) => asset.url.endsWith("/a")).length,
      missing ? 2 : 1,
    );
  }
});
test("asset URL kinds, stable hashes and SVG index-based identity match original", async () => {
  for (const value of [
    "a.PNG?q=1#x",
    "https://example.com/a.mjs",
    "a.woff2",
    "a.mov",
    "a.css",
    "bad://[a",
    "data:image/png;base64,AA==",
    "no-extension",
  ]) {
    assert.equal(assetKindFromUrl(value), original.Hc(value));
    assert.equal(await assetId(value), await original.ZF(value));
  }
  async function run(fn: any, entries: any) {
    const trace: any[] = [];
    const result = await fn({
      tabId: 2,
      cdp: {
        evaluateJavascript: async (...args: any[]) => {
          trace.push(args);
          return entries;
        },
      },
    });
    return { trace, result };
  }
  for (const entries of [
    null,
    [],
    [
      { markup: "" },
      { markup: "<svg/>", name: "" },
      { markup: "<svg/>", name: "named" },
    ],
  ])
    assert.deepEqual(
      await run(discoverInlineSvgs, entries),
      await run(original.YF, entries),
    );
});

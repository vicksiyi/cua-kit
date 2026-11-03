import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source.ts";
import { createPageAssetsClass } from "../packages/browser/dist/service/context/page_assets.js";
const symbols = [
  "Lt",
  "qe",
  "UB",
  "IX",
  "Es",
  "qB",
  "Hc",
  "QF",
  "hg",
  "Soe",
  "xoe",
  "Eoe",
  "Toe",
  "Coe",
  "eL",
  "Aoe",
  "oL",
  "tL",
  "Poe",
  "Roe",
  "rL",
  "nL",
  "Ioe",
  "koe",
  "Boe",
];
function normalize(value: any) {
  return JSON.parse(
    JSON.stringify(value, (key, v) =>
      key === "elapsedMs"
        ? 0
        : typeof v === "string"
          ? v.replace(
              /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g,
              "UUID",
            )
          : v,
    ),
  );
}
function fixture(original: boolean, mode: string) {
  const trace: any[] = [];
  const report = (...args: any[]) => {
    trace.push(["report", ...args]);
  };
  const Class = original
    ? originalServiceBindings(symbols, { dt: report }).hg
    : createPageAssetsClass(report);
  const cdp = {
    async call(_: number, method: string, params: any) {
      trace.push([method, params]);
      if (method === "Page.getFrameTree")
        return { frameTree: { frame: { id: "frame" } } };
      if (method === "Page.getResourceContent") {
        if (mode === "fallback" || mode === "deny")
          throw Error("no loaded bytes");
        return { content: "AAE=", base64Encoded: true };
      }
      if (method === "Page.getResourceTree")
        return {
          frameTree: {
            resources: [
              "https://one.com/a.png",
              "https://one.com/b.png",
              "https://two.com/c.png",
            ].map((url) => ({
              url,
              mimeType: mode === "mismatch" ? "text/html" : "image/png",
            })),
          },
        };
    },
    async evaluateJavascript(_: number, expression: string) {
      trace.push(["fetch", expression.match(/https:\/\/[^"}]+/)?.[0]]);
      return { base64: "AAE=", contentType: "image/png" };
    },
  };
  const filesystem = {
    tmpDir: "/tmp/test",
    mkdir: async (...args: any[]) => {
      trace.push(["mkdir", ...args]);
    },
    rm: async (...args: any[]) => {
      trace.push(["rm", ...args]);
    },
    writeFile: async (path: string, content: any) => {
      trace.push([
        "write",
        path,
        typeof content === "string" ? content : [...content],
      ]);
    },
  };
  const security = {
    createAuthorityBuilder: () => ({
      downloadFiles: (request: any) => ({
        assert: async () => {
          trace.push(["approve", request]);
          if (mode === "deny" && request.type === "page-asset-fetch")
            throw "denied";
        },
      }),
    }),
  };
  const instance = new Class(cdp, security, "runtime", filesystem, "client");
  return { instance, trace };
}
function assets() {
  return [
    "https://one.com/a.png",
    "https://one.com/b.png",
    "https://two.com/c.png",
  ].map((url, index) => ({
    id: `id${index}`,
    name: `asset${index}`,
    url,
    sources: [],
    kind: "image" as const,
  }));
}
test("page asset bundle matches original bytes, manifest, MIME rejection and serialized approval cache", async () => {
  async function run(isOriginal: boolean, mode: string) {
    const { instance: o, trace } = fixture(isOriginal, mode);
    const inventoryId = o.createInventory({
      assets: assets(),
      inlineSvgs: [{ id: "svg", markup: "<svg/>", name: "svg" }],
      documentUrl: "https://page.com/",
      tabId: 1,
    });
    try {
      const result = await o.bundle({
        inventoryId,
        documentUrl: "https://page.com/",
        tabId: 1,
      });
      return normalize({ trace, result, fields: Object.keys(o) });
    } catch (error: any) {
      return normalize({ trace, error: error.message });
    }
  }
  for (const mode of ["loaded", "fallback", "mismatch", "deny"])
    assert.deepEqual(await run(false, mode), await run(true, mode));
});
test("page asset selection preserves invalidation, duplicate IDs, inline SVG collisions and validation order", async () => {
  async function run(isOriginal: boolean) {
    const { instance: o, trace } = fixture(isOriginal, "loaded");
    const inventoryId = o.createInventory({
      assets: [
        ...assets(),
        {
          id: "script",
          kind: "script",
          name: "code",
          url: "https://one.com/code.js",
          sources: [],
        },
      ],
      inlineSvgs: [{ id: "id0", name: "replacement", markup: "<svg/>" }],
      tabId: 1,
      documentUrl: "url",
    });
    const base = { inventoryId, tabId: 1, documentUrl: "url" };
    const selections = [
      o.getAssets({ ...base, tabId: 2 }),
      o.getAssets({ ...base, documentUrl: "different" }),
      o.getAssets({
        ...base,
        assetIds: ["id0", "id0", "missing"],
        kinds: ["image"],
      }),
    ];
    const errors = [];
    for (const extra of [
      { tabId: 2 },
      { assetIds: ["missing", "script"] },
      { assetIds: ["script"] },
      { kinds: ["other"] },
      { assetIds: ["script"], kinds: ["image"] },
    ]) {
      try {
        await o.bundle({ ...base, ...extra });
      } catch (error: any) {
        errors.push(error.message);
      }
    }
    return { selections, errors, trace };
  }
  assert.deepEqual(await run(false), await run(true));
});

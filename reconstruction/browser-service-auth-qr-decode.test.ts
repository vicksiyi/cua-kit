import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { serviceExpression } from "./service-source";
import { createAuthQrDecoder } from "../packages/browser/src/service/browser_auth/qr_decode";
import { authQrCode } from "../packages/browser/src/service/browser_auth/qr_monitor";
const moduleUrl = "file:///fixture/pkg/dist/scripts/browser-service.mjs";
function oracle(deps: any) {
  const declarations = ["xf", "XY", "YY", "JY", "ZY"]
    .map(
      (name) =>
        `const ${name}=(${serviceExpression(name).replaceAll("import.meta.url", JSON.stringify(moduleUrl))});`,
    )
    .join("\n");
  return new Function(
    "qD",
    "jD",
    "HD",
    `let K_;${declarations};return {decode:xf,decodeWasm:XY,decodeBrowser:ZY,initialize:YY,loadWasm:JY};`,
  )(deps.configureReader, deps.readBarcodes, authQrCode);
}
async function run(source: boolean, mode: string) {
  const trace: any[] = [];
  const backing = new Uint8Array([9, 1, 2, 3, 9]);
  const bytes = backing.subarray(1, 4);
  const points = [
    { x: 1, y: 2 },
    { x: 11, y: 2 },
    { x: 11, y: 12 },
    { x: 1, y: 12 },
  ];
  const symbol = {
    isValid: true,
    text: "synthetic-qr",
    position: {
      topLeft: points[0],
      topRight: points[1],
      bottomRight: points[2],
      bottomLeft: points[3],
    },
  };
  let reads = 0;
  const context: any = {
    filesystem: {
      async readBytes(url: URL) {
        trace.push(["load", url.href]);
        if (
          mode === "load-error" ||
          (mode === "fallback-path" && ++reads === 1)
        )
          throw new Error("load");
        return bytes;
      },
    },
    playwright: {
      async evaluateOnPlaywrightPage(
        tab: string,
        callback: Function,
        options: any,
      ) {
        trace.push(["page", tab, options]);
        return vm.runInNewContext(`(${callback.toString()})(null,arg)`, {
          arg: options.arg,
          atob,
          Uint8Array,
          Blob,
          BarcodeDetector:
            mode === "no-detector"
              ? undefined
              : class {
                  constructor(options: any) {
                    trace.push(["detector", options]);
                  }
                  async detect() {
                    trace.push(["detect"]);
                    if (mode === "detect-error") throw new Error("detect");
                    if (mode === "browser-none") return [];
                    if (mode === "browser-multiple") return [{}, {}];
                    return [
                      {
                        rawValue: mode === "browser-empty" ? "" : "browser-qr",
                        ...(mode === "no-bounds"
                          ? {}
                          : mode === "box"
                            ? {
                                boundingBox: {
                                  x: 2,
                                  y: 3,
                                  width: 4,
                                  height: 5,
                                },
                              }
                            : { cornerPoints: points }),
                      },
                    ];
                  }
                },
          async createImageBitmap(blob: Blob) {
            trace.push(["bitmap", blob.type, blob.size]);
            return {
              close() {
                trace.push(["close"]);
              },
            };
          },
        });
      },
    },
  };
  const deps = {
    moduleUrl,
    configureReader(options: any) {
      trace.push([
        "configure",
        [...new Uint8Array(options.overrides.wasmBinary)],
        options.overrides.wasmBinary === backing.buffer,
      ]);
      if (mode === "configure-error") throw new Error("configure");
    },
    async readBarcodes(data: Uint8Array, options: any) {
      trace.push(["read", [...data], options]);
      if (mode === "wasm-error") throw new Error("wasm");
      if (mode === "wasm-none") return [];
      if (mode === "wasm-multiple") return [symbol, symbol];
      if (mode === "normal" || mode === "fallback-path") return [symbol];
      if (mode === "wasm-invalid") return [{ ...symbol, isValid: false }];
      return [];
    },
  };
  const decoder = source ? oracle(deps) : createAuthQrDecoder(deps);
  const browserOnly = [
    "no-detector",
    "detect-error",
    "browser-none",
    "browser-multiple",
    "browser-empty",
    "no-bounds",
    "box",
    "browser-normal",
  ].includes(mode);
  const url =
    mode === "no-data"
      ? "invalid"
      : mode === "bad-base64"
        ? "data:image/jpeg;base64,!"
        : "data:image/jpeg;base64,AQID";
  const results = [];
  for (let i = 0; i < 2; i++)
    results.push(
      await (browserOnly
        ? decoder.decodeBrowser(url, { tab_id: "7", timeout_ms: 123 }, context)
        : decoder.decode(url, { tab_id: "7", timeout_ms: 123 }, context)),
    );
  return JSON.parse(JSON.stringify({ results, trace }));
}
test("QR decode matches original initialization, fallback distinctions and page resource cleanup", async () => {
  for (const mode of [
    "normal",
    "fallback-path",
    "load-error",
    "configure-error",
    "wasm-error",
    "wasm-none",
    "wasm-multiple",
    "wasm-invalid",
    "no-data",
    "bad-base64",
    "no-detector",
    "detect-error",
    "browser-none",
    "browser-multiple",
    "browser-empty",
    "no-bounds",
    "box",
    "browser-normal",
  ])
    assert.deepEqual(await run(false, mode), await run(true, mode), mode);
  const normal = await run(false, "normal");
  assert.equal(normal.results[0].payload, "synthetic-qr");
  assert.equal(normal.trace.filter((e: any) => e[0] === "load").length, 1);
  assert.equal(
    (await run(false, "wasm-none")).trace.filter((e: any) => e[0] === "page")
      .length,
    0,
  );
  assert.equal(
    (await run(false, "load-error")).trace.filter((e: any) => e[0] === "load")
      .length,
    2,
  );
  assert.equal(
    (await run(false, "detect-error")).trace.filter(
      (e: any) => e[0] === "close",
    ).length,
    2,
  );
});
test("QR decoder shares pending initialization and copies only the byte view", async () => {
  let release!: (bytes: Uint8Array) => void;
  let loads = 0;
  let configured: any;
  const pending = new Promise<Uint8Array>((resolve) => {
    release = resolve;
  });
  const decoder = createAuthQrDecoder({
    moduleUrl,
    configureReader(options) {
      configured = options;
    },
    async readBarcodes() {
      return [];
    },
  });
  const context = {
    filesystem: {
      readBytes() {
        loads++;
        return pending;
      },
    },
  };
  const first = decoder.initialize(context),
    second = decoder.initialize(context);
  assert.equal(loads, 1);
  const source = new Uint8Array([8, 1, 2, 8]);
  release(source.subarray(1, 3));
  await Promise.all([first, second]);
  source[1] = 9;
  assert.deepEqual(
    [...new Uint8Array(configured.overrides.wasmBinary)],
    [1, 2],
  );
});

test("assembled QR capture reaches shared decoder through original screenshot options", async () => {
  const { createAuthQrFlow } =
    await import("../packages/browser/src/service/browser_auth/qr");
  let loads = 0;
  const calls: any[] = [];
  const flow = createAuthQrFlow({
    moduleUrl,
    configureReader() {},
    async readBarcodes(bytes, options) {
      calls.push(["decode", [...bytes], options]);
      return [
        {
          isValid: true,
          text: "synthetic-flow",
          position: {
            topLeft: { x: 0, y: 0 },
            topRight: { x: 10, y: 0 },
            bottomRight: { x: 10, y: 10 },
            bottomLeft: { x: 0, y: 10 },
          },
        },
      ];
    },
  });
  const context = {
    filesystem: {
      async readBytes() {
        loads++;
        return new Uint8Array([1]);
      },
    },
    cdp: {
      async call(...args: any[]) {
        calls.push(["capture", ...args]);
        return { data: "AQID" };
      },
    },
  };
  assert.deepEqual(await flow.capture({ tab_id: "7" }, context), {
    payload: "synthetic-flow",
    bounds: { x: 0, y: 0, width: 10, height: 10 },
  });
  await flow.capture({ tab_id: "7" }, context);
  assert.equal(loads, 1);
  assert.deepEqual(calls[0], [
    "capture",
    7,
    "Page.captureScreenshot",
    { format: "jpeg", fromSurface: true, optimizeForSpeed: true, quality: 80 },
    { preserveDebuggerOnTimeout: true, timeoutMs: 2000 },
  ]);
});

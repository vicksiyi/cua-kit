import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  createBarcodeReaderRuntime,
  barcodeGrayscale,
  barcodeReaderOptions,
  defaultBarcodeReaderOptions,
} from "../packages/browser/src/service/browser_auth/zxing_reader";
function original() {
  return originalServiceBindings([
    "CY",
    "BD",
    "DD",
    "OD",
    "LY",
    "V_",
    "UY",
    "MD",
    "qY",
    "ND",
    "jY",
    "FD",
    "HY",
    "Sf",
    "kD",
    "WY",
    "GY",
    "G_",
    "VY",
    "z_",
    "zY",
    "LD",
  ]);
}
test("barcode options and grayscale retain original enum, alias and rounding semantics", () => {
  const source = original();
  assert.deepEqual(defaultBarcodeReaderOptions, source.Sf);
  for (const formats of [
    [],
    ["QRCode"],
    ["Any", "rMQRCode", "DataBarExpanded", "unknown"],
    ["constructor", "toString"],
  ])
    for (const choice of ["Unknown", "UnicodeBig", "UTF8", "invalid"])
      for (const mode of [undefined, null, true, false, 0, "yes"]) {
        const options = {
          ...defaultBarcodeReaderOptions,
          formats,
          characterSet: choice,
          binarizer: "invalid",
          tryCode39ExtendedMode: mode,
        };
        assert.deepEqual(barcodeReaderOptions(options), source.kD(options));
      }
  for (let length = 0; length < 50; length++) {
    const bytes = Uint8Array.from({ length }, (_, i) => (i * 71) % 256);
    assert.deepEqual(barcodeGrayscale(bytes), source.zY(bytes));
  }
});
async function run(source: boolean, kind: string, failure: string) {
  const trace: any[] = [];
  const heap = new Uint8Array(128);
  const factory: any = async (options: any) => {
    trace.push(["init", Object.keys(options)]);
    return {
      HEAPU8: heap,
      _malloc(size: number) {
        trace.push(["alloc", size]);
        return failure === "alloc" ? 0 : 4;
      },
      _free(pointer: number) {
        trace.push(["free", pointer]);
      },
      readBarcodesFromPixmap(...args: any[]) {
        trace.push(["pixmap", ...args, [...heap.slice(4, 8)]]);
        if (failure === "read") throw new Error("decode");
        return vector;
      },
      readBarcodesFromImage(...args: any[]) {
        trace.push(["image", ...args, [...heap.slice(4, 8)]]);
        if (failure === "read") throw new Error("decode");
        return vector;
      },
    };
  };
  const vector = {
    size() {
      return 2;
    },
    get(index: number) {
      if (failure === "result") throw new Error("result");
      return {
        format: "QRCode",
        symbology: "QR",
        contentType: index === 0 ? 0 : 99,
        text: "synthetic",
      };
    },
  };
  const input =
    kind === "pixels"
      ? {
          width: 2,
          height: 1,
          data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 0]),
        }
      : kind === "clamped"
        ? { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 255, 255]) }
        : kind === "buffer"
          ? new Uint8Array([1, 2, 3]).buffer
          : kind === "blob"
            ? new Blob([new Uint8Array([1, 2, 3])])
            : kind === "view"
              ? new Uint8Array([8, 1, 2, 3, 8]).subarray(1, 4)
              : kind === "invalid"
                ? {}
                : new Uint8Array([]);
  const reader = source
    ? { read: original().LD }
    : createBarcodeReaderRuntime();
  let result: any;
  try {
    result = await reader.read(factory, input, {
      formats: ["QRCode"],
      maxNumberOfSymbols: 2,
    });
  } catch (error) {
    result = { error: (error as Error).message };
  }
  return { trace, result };
}
test("barcode reader matches original input branches, memory lifetime and result projection", async () => {
  for (const kind of [
    "pixels",
    "clamped",
    "buffer",
    "blob",
    "view",
    "invalid",
    "empty",
  ])
    for (const failure of ["none", "alloc", "read", "result"])
      assert.deepEqual(
        await run(false, kind, failure),
        await run(true, kind, failure),
        `${kind}/${failure}`,
      );
  assert.deepEqual((await run(false, "view", "read")).trace.at(-1), [
    "free",
    4,
  ]);
});
test("barcode module configuration preserves lazy overrides and promise identity", async () => {
  async function scenario(source: boolean) {
    const runtime = createBarcodeReaderRuntime();
    const configure = source ? original().z_ : runtime.configure;
    const trace: any[] = [];
    const factory: any = (options: any) => {
      trace.push(["init", options.value]);
      return Promise.resolve({});
    };
    assert.equal(configure(factory, { overrides: { value: 1 } }), undefined);
    const first = configure(factory, { fireImmediately: true });
    const second = configure(factory, {
      overrides: { value: 1 },
      fireImmediately: true,
    });
    assert.equal(first, second);
    await first;
    configure(factory, { overrides: { value: 2 } });
    await configure(factory, { fireImmediately: true });
    const same = configure(factory, { fireImmediately: true });
    configure(factory, { overrides: { value: 3 }, equalityFn: () => true });
    assert.equal(configure(factory, { fireImmediately: true }), same);
    return trace;
  }
  assert.deepEqual(await scenario(false), await scenario(true));
});

test("assembled QR flow allocates screenshot bytes through restored reader wrapper", async () => {
  const { createAuthQrFlowFromWasmFactory } =
    await import("../packages/browser/src/service/browser_auth/qr");
  const trace: any[] = [];
  const heap = new Uint8Array(32);
  const flow = createAuthQrFlowFromWasmFactory(
    "file:///fixture/scripts/browser-service.mjs",
    async (options) => {
      assert.deepEqual([...new Uint8Array(options.wasmBinary)], [1, 2]);
      return {
        HEAPU8: heap,
        _malloc(size) {
          trace.push(["malloc", size]);
          return 4;
        },
        _free(pointer) {
          trace.push(["free", pointer]);
        },
        readBarcodesFromPixmap() {
          throw new Error("unexpected pixels");
        },
        readBarcodesFromImage(pointer, length, options) {
          trace.push(["read", pointer, length, options.formats]);
          assert.deepEqual(
            [...heap.slice(pointer, pointer + length)],
            [1, 2, 3],
          );
          return {
            size() {
              return 1;
            },
            get() {
              return {
                isValid: true,
                text: "synthetic",
                contentType: 0,
                position: {
                  topLeft: { x: 0, y: 0 },
                  topRight: { x: 2, y: 0 },
                  bottomRight: { x: 2, y: 2 },
                  bottomLeft: { x: 0, y: 2 },
                },
              };
            },
          };
        },
      };
    },
  );
  const result = await flow.capture(
    { tab_id: "7" },
    {
      filesystem: {
        async readBytes() {
          return new Uint8Array([1, 2]);
        },
      },
      cdp: {
        async call() {
          return { data: "AQID" };
        },
      },
    },
  );
  assert.equal(result?.payload, "synthetic");
  assert.deepEqual(trace, [
    ["malloc", 3],
    ["read", 4, 3, "QRCode"],
    ["free", 4],
  ]);
});

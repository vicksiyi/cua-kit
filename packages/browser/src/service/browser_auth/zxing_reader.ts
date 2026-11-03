/** Readable reconstruction of the bundled zxing-wasm 3.1.2 reader wrapper.
 * Emscripten module factory (original UD) remains a host assembly dependency.
 */
const aliases: Record<string, string> = {
  DataBarExpanded: "DataBarExp",
  DataBarLimited: "DataBarLtd",
  "Linear-Codes": "AllLinear",
  "Matrix-Codes": "AllMatrix",
  Any: "All",
  rMQRCode: "RMQRCode",
};
const binarizers = [
  "LocalAverage",
  "GlobalHistogram",
  "FixedThreshold",
  "BoolCast",
];
const characterSets =
  "Unknown.ASCII.ISO8859_1.ISO8859_2.ISO8859_3.ISO8859_4.ISO8859_5.ISO8859_6.ISO8859_7.ISO8859_8.ISO8859_9.ISO8859_10.ISO8859_11.ISO8859_13.ISO8859_14.ISO8859_15.ISO8859_16.Cp437.Cp1250.Cp1251.Cp1252.Cp1256.Shift_JIS.Big5.GB2312.GB18030.EUC_JP.EUC_KR.UTF16BE.UTF8.UTF16LE.UTF32BE.UTF32LE.BINARY".split(
    ".",
  );
const contentTypes = [
  "Text",
  "Binary",
  "Mixed",
  "GS1",
  "ISO15434",
  "UnknownECI",
];
export const defaultBarcodeReaderOptions = {
  formats: [] as string[],
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  tryDenoise: false,
  binarizer: "LocalAverage",
  isPure: false,
  downscaleFactor: 3,
  downscaleThreshold: 500,
  minLineCount: 2,
  maxNumberOfSymbols: 255,
  validateOptionalChecksum: false,
  returnErrors: false,
  eanAddOnSymbol: "Ignore",
  textMode: "HRI",
  characterSet: "Unknown",
  tryCode39ExtendedMode: true,
};
/** Original kD and enum/alias helpers. Unknown values retain original -1 behavior. */
export function barcodeReaderOptions(options: any) {
  return {
    ...options,
    formats: options.formats
      .map((format: string) => aliases[format] ?? format)
      .join(","),
    binarizer: binarizers.indexOf(options.binarizer),
    eanAddOnSymbol: ["Ignore", "Read", "Require"].indexOf(
      options.eanAddOnSymbol,
    ),
    textMode: ["Plain", "ECI", "HRI", "Escaped", "Hex", "HexECI"].indexOf(
      options.textMode,
    ),
    characterSet: characterSets.indexOf(
      options.characterSet === "UnicodeBig" ? "UTF16BE" : options.characterSet,
    ),
    tryCode39ExtendedMode:
      options.tryCode39ExtendedMode == null || options.tryCode39ExtendedMode,
  };
}
/** Original zY. Alpha is ignored; source length is truncated to complete RGBA pixels. */
export function barcodeGrayscale(bytes: Uint8Array | Uint8ClampedArray) {
  const count = bytes.byteLength >> 2,
    result = new Uint8Array(count);
  for (let index = 0; index < count; index++) {
    const offset = index << 2;
    result[index] =
      (306 * bytes[offset] +
        601 * bytes[offset + 1] +
        117 * bytes[offset + 2] +
        512) >>
      10;
  }
  return result;
}
export function sameBarcodeOverrides(a: any, b: any) {
  return (
    Object.is(a, b) ||
    (Object.keys(a).length === Object.keys(b).length &&
      Object.keys(a).every((key) => Object.hasOwn(b, key) && a[key] === b[key]))
  );
}
export interface BarcodeModule {
  HEAPU8: Uint8Array;
  _malloc(size: number): number;
  _free(pointer: number): void;
  readBarcodesFromPixmap(...args: any[]): any;
  readBarcodesFromImage(...args: any[]): any;
}
export type BarcodeModuleFactory = (options: any) => Promise<BarcodeModule>;
/** Original GY/G_/z_/LD: cache per module factory and free allocations even on decode failure. */
export function createBarcodeReaderRuntime() {
  const cache = new WeakMap<
    BarcodeModuleFactory,
    [any, Promise<BarcodeModule>?]
  >();
  const defaults = {
    locateFile(filename: string, prefix: string) {
      const match = filename.match(/_(.+?)\.wasm$/);
      return match
        ? `https://fastly.jsdelivr.net/npm/zxing-wasm@3.1.2/dist/${match[1]}/${filename}`
        : prefix + filename;
    },
  };
  function configure(
    factory: BarcodeModuleFactory,
    {
      overrides,
      equalityFn = sameBarcodeOverrides,
      fireImmediately = false,
    }: {
      overrides?: any;
      equalityFn?: (a: any, b: any) => boolean;
      fireImmediately?: boolean;
    } = {},
  ) {
    const [previous, pending] = cache.get(factory) ?? [defaults];
    const next = overrides ?? previous;
    if (fireImmediately) {
      if (pending && equalityFn(previous, next)) return pending;
      const initialized = factory({ ...next });
      cache.set(factory, [next, initialized]);
      return initialized;
    }
    if (!equalityFn(previous, next)) cache.set(factory, [next]);
  }
  async function read(
    factory: BarcodeModuleFactory,
    input: any,
    options: any = defaultBarcodeReaderOptions,
  ) {
    const merged = { ...defaultBarcodeReaderOptions, ...options };
    const module = await configure(factory, { fireImmediately: true })!;
    let results: any, pointer: number;
    if ("width" in input && "height" in input && "data" in input) {
      const { data, width, height } = input;
      const gray = barcodeGrayscale(data),
        length = gray.byteLength;
      pointer = module._malloc(length);
      if (!pointer)
        throw Error(`Failed to allocate ${length} bytes in WASM memory`);
      try {
        module.HEAPU8.set(gray, pointer);
        results = module.readBarcodesFromPixmap(
          pointer,
          width,
          height,
          barcodeReaderOptions(merged),
        );
      } finally {
        module._free(pointer);
      }
    } else {
      let length: number, bytes: any;
      if ("buffer" in input) {
        length = input.byteLength;
        bytes = input;
      } else if ("byteLength" in input) {
        length = input.byteLength;
        bytes = new Uint8Array(input);
      } else if ("size" in input) {
        length = input.size;
        bytes = new Uint8Array(await input.arrayBuffer());
      } else throw TypeError("Invalid input type");
      pointer = module._malloc(length);
      if (!pointer)
        throw Error(`Failed to allocate ${length} bytes in WASM memory`);
      try {
        module.HEAPU8.set(bytes, pointer);
        results = module.readBarcodesFromImage(
          pointer,
          length,
          barcodeReaderOptions(merged),
        );
      } finally {
        module._free(pointer);
      }
    }
    const output = [];
    for (let index = 0; index < results.size(); index++) {
      const result = results.get(index);
      output.push({
        ...result,
        format: result.format,
        symbology: result.symbology,
        contentType: contentTypes[result.contentType],
      });
    }
    return output;
  }
  return { configure, read };
}

import { authQrCode } from "./qr_monitor";
export interface AuthQrDecoderDependencies {
  /** Original browser-service module URL; host assembly supplies its packaged asset location. */
  moduleUrl: string;
  loadWasm?(context: any): Promise<Uint8Array>;
  configureReader(options: { overrides: { wasmBinary: ArrayBuffer } }): unknown;
  readBarcodes(
    bytes: Uint8Array,
    options: { formats: string[]; maxNumberOfSymbols: number },
  ): Promise<any[]>;
}
/** Original xf/XY/YY/JY/ZY. One initialization promise per assembled decoder, including failures. */
export function createAuthQrDecoder(dependencies: AuthQrDecoderDependencies) {
  let initialization: Promise<void> | undefined;
  async function loadWasm(context: any) {
    if (dependencies.loadWasm) return dependencies.loadWasm(context);
    try {
      return await context.filesystem.readBytes(
        new URL("./zxing_reader.wasm", dependencies.moduleUrl),
      );
    } catch {
      return await context.filesystem.readBytes(
        new URL(
          "../../../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm",
          dependencies.moduleUrl,
        ),
      );
    }
  }
  async function initialize(context: any) {
    if (initialization == null)
      initialization = loadWasm(context).then((bytes) => {
        const owned = new Uint8Array(bytes.byteLength);
        owned.set(bytes);
        dependencies.configureReader({
          overrides: { wasmBinary: owned.buffer },
        });
      });
    await initialization;
  }
  async function decodeWasm(url: string, context: any) {
    try {
      await initialize(context);
      const encoded = url.split(",", 2)[1];
      if (encoded == null) return;
      const bytes = Uint8Array.from(atob(encoded), (character) =>
        character.charCodeAt(0),
      );
      const results = await dependencies.readBarcodes(bytes, {
        formats: ["QRCode"],
        maxNumberOfSymbols: 2,
      });
      if (results.length === 0) return null;
      if (results.length !== 1) return;
      const code = results[0];
      return code == null || !code.isValid
        ? undefined
        : (authQrCode(code.text, [
            code.position.topLeft,
            code.position.topRight,
            code.position.bottomRight,
            code.position.bottomLeft,
          ]) ?? undefined);
    } catch {
      return undefined;
    }
  }
  async function decodeBrowser(url: string, params: any, context: any) {
    try {
      const result = await context.playwright.evaluateOnPlaywrightPage(
        params.tab_id,
        async (_page: any, arg: any) => {
          const Detector = (globalThis as any).BarcodeDetector;
          if (Detector == null) return;
          const encoded = arg.screenshotUrl.split(",", 2)[1];
          if (encoded == null) return;
          const bytes = Uint8Array.from(atob(encoded), (character) =>
            character.charCodeAt(0),
          );
          const bitmap = await createImageBitmap(
            new Blob([bytes], { type: "image/jpeg" }),
          );
          try {
            const results = await new Detector({ formats: ["qr_code"] }).detect(
              bitmap,
            );
            if (results.length === 0) return null;
            if (results.length !== 1) return;
            const code = results[0];
            if (code == null || code.rawValue.length === 0) return;
            const points =
              code.cornerPoints != null && code.cornerPoints.length >= 4
                ? code.cornerPoints
                : code.boundingBox == null
                  ? null
                  : [
                      { x: code.boundingBox.x, y: code.boundingBox.y },
                      {
                        x: code.boundingBox.x + code.boundingBox.width,
                        y: code.boundingBox.y,
                      },
                      {
                        x: code.boundingBox.x + code.boundingBox.width,
                        y: code.boundingBox.y + code.boundingBox.height,
                      },
                      {
                        x: code.boundingBox.x,
                        y: code.boundingBox.y + code.boundingBox.height,
                      },
                    ];
            return points == null
              ? undefined
              : {
                  payload: code.rawValue,
                  points: points.map(({ x, y }: any) => ({ x, y })),
                };
          } finally {
            bitmap.close();
          }
        },
        {
          arg: { screenshotUrl: url },
          isolatedWorld: true,
          timeoutMs: params.timeout_ms,
        },
      );
      return result == null
        ? result
        : (authQrCode(result.payload, result.points) ?? undefined);
    } catch {
      return undefined;
    }
  }
  async function decode(url: string, params: any, context: any) {
    const result = await decodeWasm(url, context);
    return result !== undefined
      ? result
      : await decodeBrowser(url, params, context);
  }
  return { decode, decodeWasm, decodeBrowser, initialize, loadWasm };
}

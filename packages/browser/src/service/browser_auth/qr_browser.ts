import { prepareZXingModule, readBarcodes, type ReaderOptions } from "zxing-wasm/reader";
import { createAuthQrFlow } from "./qr_shared";
export * from "./qr_shared";
/** Original extension gR: use the host filesystem capability, retaining its failure behavior. */
export async function loadExtensionQrWasm(context: any, locationHref: string) {
  try {
    return await context.filesystem.readBytes(new URL("./zxing_reader.wasm", locationHref));
  } catch {
    return await context.filesystem.readBytes(new URL("/assets/zxing_reader-vui-RP1A.wasm", locationHref));
  }
}
/** Browser counterpart of the packaged Node resolver. Asset placement belongs to packaging. */
export function createPackagedAuthQrFlow() {
  const locationHref = self.location.href;
  return createAuthQrFlow({
    moduleUrl: locationHref,
    loadWasm: context => loadExtensionQrWasm(context, locationHref),
    configureReader: options => prepareZXingModule(options),
    readBarcodes: (bytes, options) => readBarcodes(bytes, options as ReaderOptions),
  });
}

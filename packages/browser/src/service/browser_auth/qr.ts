import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createAuthQrFlowFromZXing } from "./qr_shared";
export * from "./qr_shared";
/** Resolve the upstream packaged WASM while retaining the original host filesystem loader.
 * No network download or installed ChatGPT asset is needed by this default.
 */
export function createPackagedAuthQrFlow() {
  const require = createRequire(import.meta.url);
  const asset = require.resolve("zxing-wasm/reader/zxing_reader.wasm");
  return createAuthQrFlowFromZXing(pathToFileURL(asset).href);
}

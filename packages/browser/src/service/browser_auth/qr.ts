import {
  createAuthQrDecoder,
  type AuthQrDecoderDependencies,
} from "./qr_decode";
import { createAuthQrMonitor } from "./qr_monitor";
/** Assemble one shared reader initialization with original capture and refresh logic. */
export function createAuthQrFlow(dependencies: AuthQrDecoderDependencies) {
  const decoder = createAuthQrDecoder(dependencies);
  return { ...decoder, ...createAuthQrMonitor(decoder.decode) };
}

import {
  createBarcodeReaderRuntime,
  type BarcodeModuleFactory,
} from "./zxing_reader";
/** Original qD/jD binding, composed with reconstructed decoder and monitor. */
export function createAuthQrFlowFromWasmFactory(
  moduleUrl: string,
  factory: BarcodeModuleFactory,
) {
  const reader = createBarcodeReaderRuntime();
  return createAuthQrFlow({
    moduleUrl,
    configureReader: (options) => reader.configure(factory, options),
    readBarcodes: (bytes, options) => reader.read(factory, bytes, options),
  });
}

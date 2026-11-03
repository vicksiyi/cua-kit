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

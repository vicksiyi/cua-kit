import { playwrightInjectedSource } from "./upstream_generated_source";
/** Full upstream injected implementation, resolved and version-checked at build time.
 * Shared by Node and browser hosts; the caller retains the CUA policy adapter. */
export function upstreamPlaywrightSource() {
  return playwrightInjectedSource;
}

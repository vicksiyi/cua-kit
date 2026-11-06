import test from "node:test";
import assert from "node:assert/strict";
// Exercise the deployed asset location, not a source-tree copy of the WASM.
import { createBrowserHostFactory } from "../packages/browser/dist/service/runtime/host.js";
import { initializeAccessibilityCore } from "../packages/browser/dist/service/accessibility/capture_manager.js";
test("built browser host exposes navigation preload and consumes the bundled AX core", async () => {
  const env = Object.freeze({});
  const repl = {
    env,
    config: {},
    createElicitation: async () => ({ action: "cancel" }),
  };
  const factory = createBrowserHostFactory({
    getPrivilegedRepl: () => repl,
    createAccessAssertion: () => async () => {},
    registerAutomatedReviewHost: () => {},
    createConfig: () => ({}),
    BrowserDirectory: class {},
    extensionSelection: () => ({}),
    Preferences: class {},
    commandTiming: {},
    createErrorReporter: () => ({}),
    performanceSpan: {},
    trackElicitation: async (_r: any, fn: any) => fn(),
    initializeCredentialObservation: async () => {},
    getNativeCredentialObservationStatus: () => {},
    createBrowserAuthBrokerChallenge: () => {},
  } as any);
  const host = await factory.createHost();
  assert.equal(host.env, env);
  const release = host.preloadAccessibilityCore();
  assert.equal(typeof release, "function");
  await initializeAccessibilityCore(undefined, { env });
  release();
  assert.equal(host.preloadAccessibilityCore(), undefined);
});

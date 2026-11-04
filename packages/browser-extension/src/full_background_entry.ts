import {
  createFullBrowserBackground,
  type FullBackgroundConfiguration,
} from "./full_background";

declare const CORE_CUA_FULL_CONFIGURATION: FullBackgroundConfiguration;

const background = createFullBrowserBackground(CORE_CUA_FULL_CONFIGURATION, {
  chrome,
  crypto: globalThis.crypto,
  navigator: {
    userAgent: navigator.userAgent,
    get onLine() {
      return navigator.onLine;
    },
    ...("brave" in navigator ? { brave: navigator.brave } : {}),
  },
  scope: globalThis,
  fetch: globalThis.fetch.bind(globalThis),
  now: () => Date.now(),
  monotonicNow: () => performance.now(),
  random: () => Math.random(),
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  setInterval: globalThis.setInterval.bind(globalThis),
  clearInterval: globalThis.clearInterval.bind(globalThis),
  console,
});
background
  .start()
  .catch((error) => console.error("[core-cua] full startup failed", error));

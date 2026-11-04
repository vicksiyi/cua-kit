import { startAssembledSidePanelPage } from "./side_panel_controller";
import { createPageTelemetryInitializer } from "./page_telemetry";

declare const CORE_CUA_PAGE_TELEMETRY_DSN: string;

// Original page tail starts telemetry without awaiting it, then starts rt/it/ge.
const initializeTelemetry = createPageTelemetryInitializer(
  { runtime: chrome.runtime, fetch: globalThis.fetch.bind(globalThis) },
  { dsn: CORE_CUA_PAGE_TELEMETRY_DSN },
);
initializeTelemetry("sidepanel");
startAssembledSidePanelPage({
  chrome,
  crypto: globalThis.crypto,
  navigator: globalThis.navigator,
  now: () => Date.now(),
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  setInterval: globalThis.setInterval.bind(globalThis),
  clearInterval: globalThis.clearInterval.bind(globalThis),
});

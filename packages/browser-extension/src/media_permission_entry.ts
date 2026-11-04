import { startMediaPermissionPage } from "./media_permission_page";
import { createPageTelemetryInitializer } from "./page_telemetry";

declare const CORE_CUA_PAGE_TELEMETRY_DSN: string;

startMediaPermissionPage({
  document: globalThis.document,
  window: globalThis.window,
  navigator: globalThis.navigator,
  initializeTelemetry: createPageTelemetryInitializer(
    { runtime: chrome.runtime, fetch: globalThis.fetch.bind(globalThis) },
    { dsn: CORE_CUA_PAGE_TELEMETRY_DSN },
  ),
});

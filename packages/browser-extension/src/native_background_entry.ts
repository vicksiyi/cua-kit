import { startNativeBrowserBackground } from "./native_background";

// Independently deployed diagnostics go to the extension console, not vendor telemetry.
const reportMetric = (name: string, value: unknown, metadata: unknown) =>
  console.info("[core-cua]", name, value, metadata);
void startNativeBrowserBackground({
  host: {
    chrome,
    crypto,
    now: Date.now,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    error: (...args) => console.error(...args),
  },
  navigator: { userAgent: navigator.userAgent },
  hostName: "com.core.cua",
  handlerOptions: { buildChannel: "dev" },
  sessionDiagnostics: {
    metric: reportMetric,
    warn: (...args) => console.warn(...args),
  },
  diagnostics: {
    reportError: (error, stage) => console.error("[core-cua]", stage, error),
    console,
    reportMetric,
  },
}).catch((error) => console.error("[core-cua] startup failed", error));

// Exact original method/domain data, with readable exported names.
/** Original Jre. */
export const allowedRawDomains = new Set([
  "Accessibility",
  "Audits",
  "CacheStorage",
  "Console",
  "CSS",
  "Database",
  "Debugger",
  "DOM",
  "DOMDebugger",
  "DOMSnapshot",
  "Emulation",
  "Fetch",
  "IO",
  "Input",
  "Inspector",
  "Log",
  "Network",
  "Overlay",
  "Page",
  "Performance",
  "Profiler",
  "Runtime",
  "Storage",
  "Target",
  "Tracing",
  "WebAudio",
  "WebAuthn",
]);
/** Original Zre. */
export const blockedRawDomains = new Set([
  "CacheStorage",
  "Database",
  "Storage",
  "Target",
  "WebAuthn",
]);
/** Original Qre. */
export const blockedRawMethods = new Set([
  "DOM.getFileInfo",
  "DOM.setFileInputFiles",
  "Input.dispatchKeyEvent",
  "Input.setInterceptDrags",
  "Network.clearBrowserCookies",
  "Network.deleteDeviceBoundSession",
  "Network.enableDeviceBoundSessions",
  "Network.getAllCookies",
  "Network.getResponseBodyForInterception",
  "Network.setCookieControls",
  "Network.setExtraHTTPHeaders",
  "Network.setRequestInterception",
  "Network.takeResponseBodyForInterceptionAsStream",
  "Page.addScriptToEvaluateOnLoad",
  "Page.addScriptToEvaluateOnNewDocument",
  "Page.crash",
  "Page.disable",
  "Page.getNavigationHistory",
  "Page.resetNavigationHistory",
  "Page.setAdBlockingEnabled",
  "Page.setBypassCSP",
  "Page.setDownloadBehavior",
  "Page.setInterceptFileChooserDialog",
  "Page.setRPHRegistrationMode",
  "Page.setSPCTransactionMode",
  "Tracing.requestMemoryDump",
]);
/** Original ene. */
export const rawMethodGuidance = new Map([
  [
    "Fetch.disable",
    "Use Fetch.enable with an empty patterns array to clear raw interception.",
  ],
  [
    "Fetch.enable",
    "Use explicit non-Document resourceType patterns; Browser Use reserves Document responses for browser-managed navigation.",
  ],
  [
    "DOM.setFileInputFiles",
    'Use tab.playwright.waitForEvent("filechooser") and chooser.setFiles(...) instead.',
  ],
  [
    "Input.dispatchDragEvent",
    'Use tab.playwright.waitForEvent("filechooser") and chooser.setFiles(...) instead for file uploads.',
  ],
  [
    "Input.dispatchKeyEvent",
    "Use tab.cua.type(...) or tab.cua.keypress(...) instead.",
  ],
  [
    "Network.getAllCookies",
    "Use Network.getCookies with explicit URLs instead.",
  ],
  [
    "Page.getNavigationHistory",
    "For supported history navigation, use tab.back() or tab.forward() instead.",
  ],
  ["Page.navigate", "Use tab.goto(url) instead."],
  ["Page.navigateToHistoryEntry", "Use tab.back() or tab.forward() instead."],
  ["Page.reload", "Use tab.reload() instead."],
  [
    "Page.setDownloadBehavior",
    'Use tab.playwright.waitForEvent("download") before triggering a download instead.',
  ],
  [
    "Page.setInterceptFileChooserDialog",
    'Use tab.playwright.waitForEvent("filechooser") and chooser.setFiles(...) instead.',
  ],
]);

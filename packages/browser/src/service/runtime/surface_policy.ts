import { environmentString, commaSeparatedValues } from "../capability_filter";
import { codexTurnMetadata } from "../preferences/request_context";
const surfaces = ["chrome", "iab", "dot", "cdp", "mcpapps"];
export function availableBrowserSurfaces(runtime: any) {
  const value = environmentString(runtime, "BROWSER_USE_AVAILABLE_BACKENDS");
  return value == null
    ? null
    : commaSeparatedValues(value).filter((surface) =>
        surfaces.includes(surface),
      );
}
export function browserSurfaceEnabled(runtime: any, surface: string) {
  const available = availableBrowserSurfaces(runtime);
  return surface === "dot"
    ? codexTurnMetadata(runtime)?.thread_source === "aeon_child" &&
        available?.includes("dot") === true
    : available == null || available.includes(surface);
}
const disabledMessages: Record<string, string> = {
  chrome:
    "The browser extension Browser Use plugin is not available in this context.",
  iab: "The Browser Use plugin is not available in this context.",
  dot: "The Browser Use plugin is not available in this context.",
  mcpapps: "The MCP Apps browser backend is not available in this context.",
  cdp: "The CDP Browser Use backend is not available in this context.",
};
export function assertBrowserSurfaceEnabled(runtime: any, surface: string) {
  if (!browserSurfaceEnabled(runtime, surface))
    throw new Error(disabledMessages[surface]);
}
export function surfaceForBackend(type: string) {
  return (
    {
      cdp: "cdp",
      extension: "chrome",
      iab: "iab",
      mcpapps: "mcpapps",
    } as Record<string, string>
  )[type];
}
/** Original kA, including legacy preference keys and numeric window validation. */
export function preferredBrowserExtension(runtime: any) {
  const value = (key: string) =>
    environmentString(runtime, key)?.trim() || undefined;
  const instance =
    value("BROWSER_USE_PREFERRED_EXTENSION_INSTANCE_ID") ??
    value("BROWSER_USE_PREFERRED_CHROME_EXTENSION_INSTANCE_ID");
  if (instance == null) return null;
  const window = Number(
    value("BROWSER_USE_PREFERRED_WINDOW_ID") ??
      value("BROWSER_USE_PREFERRED_CHROME_WINDOW_ID"),
  );
  return {
    extensionInstanceId: instance,
    ...(Number.isSafeInteger(window) && window >= 0
      ? { preferredWindowId: window }
      : {}),
  };
}

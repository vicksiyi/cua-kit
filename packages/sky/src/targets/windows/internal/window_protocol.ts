import type * as T from "../../../types/window2/index";
export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
export function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
export function put(object: object, key: string, value: unknown) {
  if (value !== undefined) Reflect.set(object, key, value);
}
export function appIdentifier(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
export function integerId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0)
    return value;
  if (typeof value === "string" && value.trim() !== "") {
    const number = Number(value);
    if (Number.isInteger(number) && number >= 0) return number;
  }
}
export function parseWindow(
  value: unknown,
  app?: string,
): T.Window | undefined {
  if (typeof value !== "object" || value == null || Array.isArray(value))
    return;
  const id = integerId(Reflect.get(value, "id"));
  if (id == null) return;
  const identifier = appIdentifier(Reflect.get(value, "app")) ?? app;
  if (identifier == null) return;
  const result: T.Window = { app: identifier, id };
  put(result, "title", optionalString(Reflect.get(value, "title")));
  return result;
}
export function requireWindow(value: unknown): T.Window {
  const result = parseWindow(value);
  if (result == null)
    throw new TypeError(
      "window.app must be a non-empty string and window.id must be an integer >= 0",
    );
  return result;
}
export function parseWindows(value: unknown, app?: string): T.Window[] {
  return Array.isArray(value)
    ? value.flatMap((v) => {
        const result = parseWindow(v, app);
        return result == null ? [] : [result];
      })
    : [];
}
export function coordinate(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new TypeError(`${field} must be a finite number`);
  return Math.round(value);
}
export function clickCount(value: unknown): number {
  const result = coordinate(value, "click_count");
  if (result < 1) throw new TypeError("click_count must be >= 1");
  return result;
}
export function elementIndex(value: unknown): number {
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  if (!Number.isInteger(value) || (value as number) < 0)
    throw new TypeError("element_index must be an integer >= 0");
  return value as number;
}
export function parseScreenshot(value: unknown): T.Screenshot {
  if (typeof value !== "object" || value == null || Array.isArray(value))
    throw new Error("codex-computer-use.exe did not return a screenshot");
  const url = Reflect.get(value, "url");
  if (typeof url !== "string" || url.length === 0)
    throw new Error("codex-computer-use.exe did not return a screenshot URL");
  const result: T.Screenshot = {
    id: optionalString(Reflect.get(value, "id")) ?? "screenshot-0",
    zIndex: optionalNumber(Reflect.get(value, "zIndex")) ?? 0,
    url,
  };
  for (const key of ["originX", "originY", "width", "height"])
    put(result, key, optionalNumber(Reflect.get(value, key)));
  return result;
}
export function parseState(
  value: unknown,
  window: T.Window,
  includeScreenshot: boolean,
): T.WindowState {
  if (typeof value !== "object" || value == null)
    throw new Error("codex-computer-use.exe did not return window state");
  const raw = Reflect.get(value, "accessibility");
  let accessibility: T.AccessibilityState | null = null;
  if (raw != null) {
    if (typeof raw !== "object" || Array.isArray(raw))
      throw new Error(
        "codex-computer-use.exe did not return accessibility state",
      );
    const tree = Reflect.get(raw, "tree");
    if (typeof tree !== "string")
      throw new Error(
        "codex-computer-use.exe did not return accessibility tree",
      );
    const selected = Reflect.get(raw, "selected_elements");
    if (
      selected != null &&
      (!Array.isArray(selected) || selected.some((v) => typeof v !== "string"))
    )
      throw new Error(
        "codex-computer-use.exe did not return selected_elements",
      );
    accessibility = { tree };
    for (const key of ["focused_element", "selected_text"])
      put(accessibility, key, optionalString(Reflect.get(raw, key)));
    put(accessibility, "selected_elements", selected ?? undefined);
    put(
      accessibility,
      "document_text",
      optionalString(Reflect.get(raw, "document_text")),
    );
  }
  const rawScreenshots = Reflect.get(value, "screenshots");
  let screenshots: T.Screenshot[];
  if (rawScreenshots == null) {
    if (includeScreenshot)
      throw new Error("codex-computer-use.exe did not return screenshots");
    screenshots = [];
  } else {
    if (!Array.isArray(rawScreenshots))
      throw new Error("codex-computer-use.exe did not return screenshots");
    screenshots = rawScreenshots.map(parseScreenshot);
  }
  return {
    window: parseWindow(Reflect.get(value, "window"), window.app) ?? window,
    screenshots,
    accessibility,
  };
}

import type { MacWindowAppState } from "./client";
const excludedInstructionApps = new Set(["com.apple.iWork.Numbers"]);
/** Preserve native text and add app instructions once per resolved app identity. */
export async function window_result(
  app: string,
  state: MacWindowAppState,
  seen: Set<string>,
) {
  const skyshot = state.skyshot;
  if (skyshot == null)
    throw new Error("computer-use service did not return a screenshot");
  const url = skyshot.screenshot?.url;
  if (url != null && typeof url !== "string")
    throw new Error("computer-use service did not return a screenshot URL");
  if (typeof skyshot.text !== "string")
    throw new Error("computer-use service did not return screenshot text");
  const instructions = state.appSpecificInstructions;
  if (instructions != null && typeof instructions !== "string")
    throw new Error(
      "computer-use service returned invalid app-specific instructions",
    );
  let text = skyshot.text;
  if (instructions != null && instructions.length > 0) {
    const identity =
      typeof state.app === "object" &&
      state.app != null &&
      typeof state.app.bundleIdentifier === "string" &&
      state.app.bundleIdentifier.length > 0
        ? state.app.bundleIdentifier
        : undefined;
    if (identity == null || !excludedInstructionApps.has(identity)) {
      const key =
        identity ??
        (typeof state.app === "string" && state.app.length > 0
          ? state.app
          : app);
      if (!seen.has(key)) {
        seen.add(key);
        text = `<app_specific_instructions>\n${instructions}\n</app_specific_instructions>\n${text}`;
      }
    }
  }
  return {
    app,
    screenshot: url == null || url.length === 0 ? null : { url },
    text,
  };
}

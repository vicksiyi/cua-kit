/** Demo deployment facts, not a recovered vendor intent classifier. */
export function surfaceContext(enabled: { browser: boolean; computer: boolean }): string {
  return [
    `Enabled CUA surfaces for this run: browser=${enabled.browser}, computer=${enabled.computer}. These are enabled interfaces, not proof of a connected browser, installed app, or granted UI permission.`,
    "Preserve the requested target: opening a local/native app is different from visiting its website. Do not replace one with the other without the user's agreement. For an ambiguous product name, use documented inventory where available or ask whether the user means the installed app or website. Select only APIs actually documented in this session.",
    enabled.computer
      ? "For a native application request, use the documented application entry point (on macOS, cua.getApp with the requested app name, bundle ID, or path). Observe the result before claiming that the app opened."
      : "Native application access is disabled in this run. If the user requests a local app, explain this limitation and that the demo must be restarted with --computer; do not search for or open its website as a substitute. This limitation does not prove the app is absent.",
    enabled.browser
      ? "For web tasks, select a documented browser entry point based on the user's browser/URL preference and observed availability."
      : "Browser automation is disabled in this run. Do not invent browser APIs or silently change a requested browser workflow to desktop automation; explain the enabled capabilities and clarify an alternative if needed.",
  ].join("\n");
}

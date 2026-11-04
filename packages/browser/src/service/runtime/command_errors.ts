import { browserFamily } from "../browser_family";
/** Original MA/T5/OA. Preserve error identity unless replacing extension-UI blocking guidance. */
export function commandErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message;
    if (typeof message === "string") return message;
  }
  return String(error ?? "");
}
export function formatCommandError(
  error: unknown,
  info?: { family?: string | null },
) {
  if (
    commandErrorMessage(error).includes(
      "Cannot access a chrome-extension:// URL of different extension",
    )
  ) {
    const family = browserFamily(info);
    return new Error(
      `${family.displayName} is blocking automation because another extension UI is open on this page. Complete or dismiss that extension UI in ${family.displayName}, then ask me to continue.`,
      { cause: error instanceof Error ? error : undefined },
    );
  }
  return error instanceof Error ? error : new Error(commandErrorMessage(error));
}

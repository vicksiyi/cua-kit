import type { PasteOptions } from "./types";
export function require_plain_text(
  options: PasteOptions | undefined,
  platform: string,
): void {
  if (options?.format !== undefined && options.format !== "text")
    throw new Error(`${platform} paste supports only text format.`);
}

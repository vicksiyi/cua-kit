import type * as T from "../../types/full-desktop/ClipboardRelease";
import type { LinuxRuntimeOptions } from "../../types/full-desktop/Options";
import { sky_linux } from "./sky_linux";
export function create_clipboard_release(
  options: LinuxRuntimeOptions,
): T.Function {
  return async (input) => {
    await sky_linux("clipboard_release", { options, input: input });
  };
}

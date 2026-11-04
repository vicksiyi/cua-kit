import type * as T from "../../types/full-desktop/ClipboardRead";
import type { LinuxRuntimeOptions } from "../../types/full-desktop/Options";
import { sky_linux } from "./sky_linux";
export function create_clipboard_read(
  options: LinuxRuntimeOptions,
): T.Function {
  return async (input) => {
    await options.action_settler.wait();
    const output = await sky_linux("clipboard_read", { options, input: input });
    options.action_settler.defer();
    return JSON.parse(output);
  };
}

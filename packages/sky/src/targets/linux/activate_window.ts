import type * as T from "../../types/full-desktop/ActivateWindow";
import type { LinuxRuntimeOptions } from "../../types/full-desktop/Options";
import { sky_linux } from "./sky_linux";
export function create_activate_window(
  options: LinuxRuntimeOptions,
): T.Function {
  return async (input) => {
    await options.action_settler.wait();
    await sky_linux("activate_window", { options, input: input });
    options.action_settler.defer();
  };
}

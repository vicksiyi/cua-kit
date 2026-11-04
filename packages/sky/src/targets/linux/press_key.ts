import type * as T from "../../types/full-desktop/PressKey";
import type { LinuxRuntimeOptions } from "../../types/full-desktop/Options";
import { sky_linux } from "./sky_linux";
export function create_press_key(options: LinuxRuntimeOptions): T.Function {
  return async (input) => {
    await options.action_settler.wait();
    await sky_linux("press_key", { options, input: input });
    options.action_settler.defer();
  };
}

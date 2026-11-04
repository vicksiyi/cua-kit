import type * as T from "../../types/full-desktop/KeyDown";
import type { LinuxRuntimeOptions } from "../../types/full-desktop/Options";
import { sky_linux } from "./sky_linux";
export function create_key_down(options: LinuxRuntimeOptions): T.Function {
  return async (input) => {
    await options.action_settler.wait();
    await sky_linux("key_down", { options, input: input });
    options.action_settler.defer();
  };
}

import type * as T from "../../types/full-desktop/Drag";
import type { LinuxRuntimeOptions } from "../../types/full-desktop/Options";
import { sky_linux } from "./sky_linux";
export function create_drag(options: LinuxRuntimeOptions): T.Function {
  return async (input) => {
    await options.action_settler.wait();
    await sky_linux("drag", { options, input: input });
    options.action_settler.defer();
  };
}

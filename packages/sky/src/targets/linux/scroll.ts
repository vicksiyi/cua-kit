import type * as T from "../../types/full-desktop/Scroll";
import type { LinuxRuntimeOptions } from "../../types/full-desktop/Options";
import { sky_linux } from "./sky_linux";
export function create_scroll(options: LinuxRuntimeOptions): T.Function {
  return async (input) => {
    await options.action_settler.wait();
    await sky_linux("scroll", {
      options,
      input: options.element_ids.resolve(input),
    });
    options.action_settler.defer();
  };
}

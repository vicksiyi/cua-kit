import type * as T from "../../types/full-desktop/TypeText";
import type { LinuxRuntimeOptions } from "../../types/full-desktop/Options";
import { sky_linux } from "./sky_linux";
export function create_type_text(options: LinuxRuntimeOptions): T.Function {
  return async (input) => {
    await options.action_settler.wait();
    await sky_linux("type_text", {
      options,
      input: options.element_ids.resolve(input),
    });
    options.action_settler.defer();
  };
}

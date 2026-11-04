import type * as T from "../../types/full-desktop/PerformSecondaryAction";
import type { LinuxRuntimeOptions } from "../../types/full-desktop/Options";
import { sky_linux } from "./sky_linux";
export function create_perform_secondary_action(
  options: LinuxRuntimeOptions,
): T.Function {
  return async (input) => {
    await options.action_settler.wait();
    await sky_linux("perform_secondary_action", {
      options,
      input: options.element_ids.resolve(input),
    });
    options.action_settler.defer();
  };
}

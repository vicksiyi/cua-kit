import type * as T from "../../types/full-desktop/TypeCharacters";
import type { LinuxRuntimeOptions } from "../../types/full-desktop/Options";
import { sky_linux } from "./sky_linux";
export function create_type_characters(
  options: LinuxRuntimeOptions,
): T.Function {
  return async (input) => {
    await options.action_settler.wait();
    const output = await sky_linux("type_characters", {
      options,
      input: input,
    });
    options.action_settler.defer();
    return JSON.parse(output);
  };
}

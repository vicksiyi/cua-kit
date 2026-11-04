import type * as T from "../../types/full-desktop/ListWindows";
import type { LinuxRuntimeOptions } from "../../types/full-desktop/Options";
import { sky_linux } from "./sky_linux";
export function create_list_windows(options: LinuxRuntimeOptions): T.Function {
  return async () => {
    await options.action_settler.wait();
    const output = await sky_linux("list_windows", { options });

    return JSON.parse(output);
  };
}

import type * as T from "../../types/full-desktop/ListApps";
import type { LinuxRuntimeOptions } from "../../types/full-desktop/Options";
import { sky_linux } from "./sky_linux";
export function create_list_apps(options: LinuxRuntimeOptions): T.Function {
  return async () => {
    await options.action_settler.wait();
    const output = await sky_linux("list_apps", { options });

    return JSON.parse(output);
  };
}

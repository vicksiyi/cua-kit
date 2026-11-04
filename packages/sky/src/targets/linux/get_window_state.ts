import type * as T from "../../types/full-desktop/GetWindowState";
import type { LinuxRuntimeOptions } from "../../types/full-desktop/Options";
import { accessibility_tree } from "./accessibility_tree";
import { load_screenshots } from "./get_screenshot";
import { sky_linux } from "./sky_linux";
export function create_get_window_state(
  options: LinuxRuntimeOptions,
): T.Function {
  return async (input) => {
    await options.action_settler.wait();
    const output = await sky_linux("get_window_state", { options, input }),
      state = JSON.parse(output);
    const screenshots = await load_screenshots(state.screenshots);
    options.element_ids.assign(
      state.ax_tree,
      state.window,
      Boolean(input.query?.trim()),
    );
    return {
      ...state,
      ax_tree: accessibility_tree(state.ax_tree, state.focused_modal),
      screenshots,
    };
  };
}

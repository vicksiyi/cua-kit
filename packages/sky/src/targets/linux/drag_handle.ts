import type * as T from "../../types/full-desktop/DragHandle";
import type { LinuxRuntimeOptions } from "../../types/full-desktop/Options";
import { sky_linux } from "./sky_linux";
export function create_drag_handle(options: LinuxRuntimeOptions): T.Function {
  return () => {
    let state: "idle" | "dragging" | "ended" = "idle";
    return {
      async start(point) {
        if (state !== "idle")
          throw new Error("drag handle can only be started once");
        await options.action_settler.wait();
        await sky_linux("drag_handle", {
          options,
          input: { action: "start", ...point },
        });
        state = "dragging";
        options.action_settler.defer();
      },
      async move_to(point) {
        if (state !== "dragging")
          throw new Error("drag handle must be started before moving");
        await options.action_settler.wait();
        await sky_linux("drag_handle", {
          options,
          input: { action: "move_to", ...point },
        });
        options.action_settler.defer();
      },
      async end() {
        if (state !== "dragging")
          throw new Error("drag handle must be started before ending");
        await options.action_settler.wait();
        await sky_linux("drag_handle", { options, input: { action: "end" } });
        state = "ended";
        options.action_settler.defer();
      },
    };
  };
}

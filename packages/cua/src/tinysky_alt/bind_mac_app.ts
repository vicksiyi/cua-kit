import { text, image } from "../core/display";
import { screenshot_bytes } from "../core/screenshot_bytes";
import { duration_seconds } from "./duration_seconds";
import type * as T from "./types";
export function bind_mac_app(computer: T.MacComputer, app: string): T.App {
  return {
    async getAXState(options) {
      const state = (await computer.get_app_state(stateOptions(app, options)))
        .text;
      await text(state, options);
      return state;
    },
    async getScreenshot(options) {
      const state = await computer.get_app_state({ app });
      if (state.screenshot === null)
        throw new Error(`Screenshot unavailable for ${app}.`);
      const bytes = await screenshot_bytes(state.screenshot.url);
      await image({ bytes, options });
      return bytes;
    },
    async getAXStateAndScreenshot(options) {
      const state = await computer.get_app_state(stateOptions(app, options));
      const value = state.text;
      await text(value, options);
      if (state.screenshot === null) return { state: value };
      const bytes = await screenshot_bytes(state.screenshot.url);
      await image({ bytes, options });
      return { state: value, screenshot: bytes };
    },
    paste: (value, options) =>
      computer.paste({ app, text: value, format: options?.format ?? "text" }),
    click(target, options) {
      const args: Parameters<typeof computer.click>[0] = { app };
      if (Array.isArray(target)) {
        args.x = target[0];
        args.y = target[1];
      } else args.element_index = target;
      if (options?.mouseButton !== undefined)
        args.mouse_button = options.mouseButton;
      if (options?.clickCount !== undefined)
        args.click_count = options.clickCount;
      if (options?.key !== undefined) args.key = options.key;
      if (options?.durationMs !== undefined)
        args.duration = duration_seconds(options.durationMs);
      return computer.click(args);
    },
    drag(from, to) {
      const [from_x, from_y] = from,
        [to_x, to_y] = to;
      return computer.drag({ app, from_x, from_y, to_x, to_y });
    },
    pressKey(key, options) {
      const args: Parameters<typeof computer.press_key>[0] = { app, key };
      if (options?.durationMs !== undefined)
        args.duration = duration_seconds(options.durationMs);
      return computer.press_key(args);
    },
    scroll(target, direction, pages) {
      if (typeof pages === "object")
        throw new Error("macOS scroll accepts pages, not pixels.");
      const args: Parameters<typeof computer.scroll>[0] = { app, direction };
      if (Array.isArray(target)) {
        args.x = target[0];
        args.y = target[1];
      } else args.element_index = target;
      if (pages !== undefined) args.pages = pages;
      return computer.scroll(args);
    },
    selectText(index, value, options) {
      const args: Parameters<typeof computer.select_text>[0] = {
        app,
        element_index: index,
        text: value,
      };
      if (options?.prefix !== undefined) args.prefix = options.prefix;
      if (options?.suffix !== undefined) args.suffix = options.suffix;
      if (options?.selectionType !== undefined)
        args.selection_type = options.selectionType;
      return computer.select_text(args);
    },
    setValue: (index, value) =>
      computer.set_value({ app, element_index: index, value }),
    typeText(value, index) {
      if (index !== undefined)
        throw new Error(
          "Typing into a specific element is only supported on Linux.",
        );
      return computer.type_text({ app, text: value });
    },
    performSecondaryAction: (index, action) =>
      computer.perform_secondary_action({ app, element_index: index, action }),
  };
}
function stateOptions(app: string, options?: T.StateOptions) {
  const args: { app: string; disableDiff?: boolean } = { app };
  if (options?.disableDiffing !== undefined)
    args.disableDiff = options.disableDiffing;
  return args;
}

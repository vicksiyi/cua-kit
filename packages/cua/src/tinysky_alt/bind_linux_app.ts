import { text, image } from "../core/display";
import { positive_pixels } from "../core/positive_pixels";
import { one_screenshot } from "./one_screenshot";
import { require_plain_text } from "./require_plain_text";
import type * as T from "./types";
// Window/state structure remains inferred until @core/sky declarations are restored.
export function bind_linux_app(computer: T.LinuxComputer, window: any): T.App {
  let currentWindow = window;
  async function observe(options: { include_screenshot: boolean }) {
    const state = await computer.get_window_state({
      window,
      include_screenshot: options.include_screenshot,
      follow_focused_modal: true,
    });
    currentWindow = state.window;
    return state;
  }
  return {
    async getAXState(options) {
      const state = await observe({ include_screenshot: false });
      const value = `Accessibility source: ${state.ax_tree_source}\n${state.ax_tree.to_string()}`;
      await text(value, options);
      return value;
    },
    async getScreenshot(options) {
      const state = await observe({ include_screenshot: true });
      const shot = one_screenshot<{ bytes: Uint8Array }>(
        state.screenshots,
        state.window.id,
      );
      if (shot === undefined)
        throw new Error(
          `Screenshot unavailable for window ${state.window.id}.`,
        );
      const bytes = shot.bytes;
      await image({ bytes, options });
      return bytes;
    },
    async getAXStateAndScreenshot(options) {
      const state = await observe({ include_screenshot: true });
      const value = `Accessibility source: ${state.ax_tree_source}\n${state.ax_tree.to_string()}`;
      await text(value, options);
      const shot = one_screenshot<{ bytes: Uint8Array }>(
        state.screenshots,
        state.window.id,
      );
      if (shot === undefined) return { state: value };
      const bytes = shot.bytes;
      await image({ bytes, options });
      return { state: value, screenshot: bytes };
    },
    click(target, options) {
      const duration = options?.durationMs;
      if (duration !== undefined) {
        if (!Array.isArray(target))
          throw new Error(
            "Linux timed clicks require window-relative coordinates.",
          );
        if (!Number.isSafeInteger(duration) || duration < 0)
          throw new Error("durationMs must be a non-negative safe integer.");
      }
      if (options?.key !== undefined && !Array.isArray(target))
        throw new Error(
          "Linux clicks with key require window-relative coordinates.",
        );
      const args: Record<string, unknown> = { window: currentWindow };
      if (Array.isArray(target)) {
        args.x = target[0];
        args.y = target[1];
      } else args.element_id = String(target);
      if (options?.mouseButton !== undefined)
        args.mouse_button = options.mouseButton;
      if (options?.clickCount !== undefined)
        args.click_count = options.clickCount;
      if (options?.key !== undefined) args.key = options.key;
      if (duration !== undefined) args.duration = duration;
      return computer.click(args);
    },
    drag: (from, to) =>
      computer.drag({
        window: currentWindow,
        path: [
          { x: from[0], y: from[1] },
          { x: to[0], y: to[1] },
        ],
      }),
    scroll(target, direction, distance) {
      if (typeof distance === "number")
        throw new Error("Linux scroll accepts { pixels }, not pages.");
      const args: Record<string, unknown> = {
        window: currentWindow,
        direction,
      };
      if (Array.isArray(target)) {
        args.x = target[0];
        args.y = target[1];
      } else args.element_id = String(target);
      if (distance !== undefined)
        args.pixels = positive_pixels(distance!.pixels);
      return computer.scroll(args);
    },
    async selectText() {
      throw new Error("selectText is unavailable on Linux.");
    },
    async setValue() {
      throw new Error(
        "setValue is unavailable on Linux; use click, pressKey, and typeText.",
      );
    },
    paste: (value, options) => (
      require_plain_text(options, "Linux"),
      computer.type_text({ window: currentWindow, text: value })
    ),
    pressKey(key, options) {
      const args: Record<string, unknown> = { window: currentWindow, key },
        duration = options?.durationMs;
      if (duration !== undefined) {
        if (!(Number.isSafeInteger(duration) && duration >= 0))
          throw new Error("durationMs must be a non-negative safe integer.");
        args.duration = duration;
      }
      return computer.press_key(args);
    },
    async typeCharacters(value) {
      return {
        charactersSent: await computer.type_characters({
          window: currentWindow,
          text: value,
        }),
      };
    },
    typeText: (value, index) =>
      index === undefined
        ? computer.type_text({ window: currentWindow, text: value })
        : computer.type_text({
            window: currentWindow,
            text: value,
            element_id: String(index),
          }),
    performSecondaryAction: (index, action) =>
      computer.perform_secondary_action({
        window: currentWindow,
        element_id: String(index),
        action,
      }),
  };
}

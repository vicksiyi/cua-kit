import { text } from "../core/display";
import { positive_pixels } from "../core/positive_pixels";
import { screenshot_bytes } from "../core/screenshot_bytes";
import { require_plain_text } from "./require_plain_text";
import type * as T from "./types";
// Wire structures are inferred from accesses in this module; full Sky types remain pending.
type Region = {
  id: string;
  url: string;
  zIndex: number;
  [key: string]: unknown;
};
export function bind_windows_app(
  computer: T.WindowsComputer,
  window: any,
): T.App {
  let screenshots: Region[] = [];
  async function observe(args: {
    include_text: boolean;
    include_screenshot: boolean;
    options?: T.ObservationOptions;
  }) {
    if (args.include_screenshot && args.options?.emit === false)
      throw new Error(
        "Windows screenshots are displayed by Sky; emit: false is unavailable.",
      );
    screenshots = [];
    const state = await computer.get_window_state({
      window,
      include_text: args.include_text,
      include_screenshot: args.include_screenshot,
    });
    window = state.window;
    screenshots = state.screenshots;
    return state;
  }
  function screenshotId(options?: T.ScreenshotInputOptions) {
    const id = options?.screenshotId;
    if (id !== undefined) {
      if (!screenshots.some((region) => region.id === id))
        throw new Error(
          "screenshotId must match a region from the latest screenshot observation.",
        );
      return id;
    }
    if (screenshots.length > 1)
      throw new Error(
        "Coordinate input requires screenshotId when the window has multiple screenshot regions.",
      );
    return screenshots[0]?.id;
  }
  function regionDescription(regions: Region[]) {
    return `Screenshot regions (display order):\n${regions.map((region, index) => `Image ${index + 1}: screenshotId=${JSON.stringify(region.id)}`).join("\n")}\nPass the matching screenshotId for coordinate input.`;
  }
  async function readRegions(regions: Region[]) {
    const result: T.ScreenshotRegion[] = [];
    for (const region of regions) {
      const { url, ...rest } = region;
      const bytes = await screenshot_bytes(url);
      result.push({ ...rest, bytes });
    }
    return result;
  }
  return {
    async getAXState(options) {
      const value = accessibilityText(
        await observe({
          include_text: true,
          include_screenshot: false,
          options,
        }),
      );
      await text(value, options);
      return value;
    },
    async getScreenshot(options) {
      const state = await observe({
        include_text: false,
        include_screenshot: true,
        options,
      });
      if (state.screenshots.length > 1) {
        await text(regionDescription(state.screenshots), options);
        return readRegions(state.screenshots);
      }
      const shot = state.screenshots[0];
      if (shot === undefined)
        throw new Error(`Screenshot unavailable for window ${window.id}.`);
      return screenshot_bytes(shot.url);
    },
    async getAXStateAndScreenshot(options) {
      const state = await observe({
          include_text: true,
          include_screenshot: true,
          options,
        }),
        value = accessibilityText(state);
      if (state.screenshots.length > 1) {
        await text(
          `${value}\n\n${regionDescription(state.screenshots)}`,
          options,
        );
        return {
          state: value,
          screenshots: await readRegions(state.screenshots),
        };
      }
      await text(value, options);
      const shot = state.screenshots[0];
      return shot === undefined
        ? { state: value }
        : { state: value, screenshot: await screenshot_bytes(shot.url) };
    },
    click(target, options) {
      if (options?.durationMs !== undefined || options?.key !== undefined)
        throw new Error("Held clicks are unavailable on Windows.");
      const args: Record<string, unknown> = { window };
      if (Array.isArray(target)) {
        const id = screenshotId(options);
        args.x = target[0];
        args.y = target[1];
        if (id !== undefined) args.screenshotId = id;
      } else {
        if (options?.screenshotId !== undefined)
          throw new Error("screenshotId applies only to coordinate input.");
        args.element_index = target;
      }
      if (options?.mouseButton !== undefined)
        args.mouse_button = options.mouseButton;
      if (options?.clickCount !== undefined)
        args.click_count = options.clickCount;
      return computer.click(args);
    },
    drag(from, to, options) {
      const id = screenshotId(options),
        [from_x, from_y] = from,
        [to_x, to_y] = to;
      const args: Record<string, unknown> = {
        window,
        from_x,
        from_y,
        to_x,
        to_y,
      };
      if (id !== undefined) args.screenshotId = id;
      return computer.drag(args);
    },
    scroll(target, direction, distance) {
      if (!Array.isArray(target) || typeof distance !== "object")
        throw new Error(
          "Windows scroll requires a point and a { pixels } distance.",
        );
      const id = screenshotId(distance),
        [x, y] = target;
      const { scrollX, scrollY } = scrollDelta(
        direction,
        positive_pixels(distance!.pixels),
      );
      const args: Record<string, unknown> = { window, x, y, scrollX, scrollY };
      if (id !== undefined) args.screenshotId = id;
      return computer.scroll(args);
    },
    async selectText() {
      throw new Error("selectText is unavailable on Windows.");
    },
    setValue: (index, value) =>
      computer.set_value({ window, element_index: index, value }),
    paste: (value, options) => (
      require_plain_text(options, "Windows"),
      computer.type_text({ window, text: value })
    ),
    pressKey(key, options) {
      if (options?.durationMs !== undefined)
        throw new Error("Held key presses are unavailable on Windows.");
      return computer.press_key({ window, key });
    },
    typeText(value, index) {
      if (index !== undefined)
        throw new Error(
          "Typing into a specific element is only supported on Linux.",
        );
      return computer.type_text({ window, text: value });
    },
    performSecondaryAction: (index, action) =>
      computer.perform_secondary_action({
        window,
        element_index: index,
        action,
      }),
  };
}
function scrollDelta(direction: string, pixels: number) {
  switch (direction) {
    case "up":
    case "u":
      return { scrollX: 0, scrollY: -pixels };
    case "down":
    case "d":
      return { scrollX: 0, scrollY: pixels };
    case "left":
    case "l":
      return { scrollX: -pixels, scrollY: 0 };
    case "right":
    case "r":
      return { scrollX: pixels, scrollY: 0 };
    default:
      throw new Error(`Unknown scroll direction: ${direction}.`);
  }
}
function accessibilityText(state: any): string {
  const ax = state.accessibility;
  if (ax === null)
    return `Accessibility state unavailable for window ${state.window.id}.`;
  const parts = [ax.tree];
  if (ax.focused_element !== undefined)
    parts.push(`Focused element: ${ax.focused_element}`);
  if (ax.selected_text !== undefined)
    parts.push(`Selected text: ${ax.selected_text}`);
  if (ax.selected_elements !== undefined)
    parts.push(`Selected elements:\n${ax.selected_elements.join("\n")}`);
  if (ax.document_text !== undefined)
    parts.push(`Document text:\n${ax.document_text}`);
  return parts.join("\n\n");
}

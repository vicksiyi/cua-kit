import { text, image } from "../core/display";
import { duration_seconds } from "./duration_seconds";
import type * as T from "./types";

/** Augments the SAME tab object; does not construct an independent provider. */
export function bind_tab(tab: T.BrowserTab): T.Tab {
  return Object.assign(tab, {
    async getAXState(options?: T.StateOptions) {
      const state =
        tab.ax === undefined
          ? await domSnapshot(tab)
          : await tab.ax.get("state", stateOptions(options));
      await text(state, options);
      return state;
    },
    async getScreenshot(options?: T.ObservationOptions) {
      const bytes =
        tab.ax === undefined
          ? await screenshot(tab)
          : await tab.ax.get("screenshot");
      await image({ bytes, options });
      return bytes;
    },
    async getAXStateAndScreenshot(options?: T.StateOptions) {
      const result =
        tab.ax === undefined
          ? await Promise.all([domSnapshot(tab), screenshot(tab)]).then(
              ([state, screenshot]) => ({ state, screenshot }),
            )
          : await tab.ax.get("both", stateOptions(options));
      await text(result.state, options);
      if (result.screenshot !== undefined)
        await image({ bytes: result.screenshot, options });
      return result;
    },
    async paste(
      elementIndex: number | null,
      value: string,
      options?: T.PasteOptions,
    ) {
      requireInputIndex(elementIndex);
      await accessibility(tab).paste(elementIndex, value, options);
    },
    click(target: number | T.Point, options?: T.ClickOptions) {
      if (options?.durationMs === undefined)
        return accessibility(tab).click(target, options);
      const { durationMs, ...rest } = options;
      return accessibility(tab).click(target, {
        ...rest,
        duration: duration_seconds(durationMs),
      });
    },
    drag: (from: T.Point, to: T.Point) => accessibility(tab).drag(from, to),
    pressKey(
      elementIndex: number | null,
      key: string,
      options?: T.PressKeyOptions,
    ) {
      requireInputIndex(elementIndex);
      const durationMs = options?.durationMs;
      const converted =
        durationMs === undefined
          ? undefined
          : { duration: duration_seconds(durationMs) };
      return accessibility(tab).pressKey(elementIndex, key, converted);
    },
    scroll: (
      target: number | T.Point,
      direction: T.Direction,
      pages?: number,
    ) => accessibility(tab).scroll(target, direction, pages),
    selectText: (index: number, value: string, options?: T.SelectTextOptions) =>
      accessibility(tab).selectText(index, value, options),
    setValue: (index: number, value: string) =>
      accessibility(tab).setValue(index, value),
    typeText: (index: number | null, value: string) => (
      requireInputIndex(index),
      accessibility(tab).typeText(index, value)
    ),
    performSecondaryAction: (index: number, action: string) =>
      accessibility(tab).performSecondaryAction(index, action),
  });
}
async function domSnapshot(tab: T.BrowserTab) {
  if (tab.playwright?.domSnapshot === undefined)
    throw new Error(`Tab ${tab.id} does not support DOM snapshots.`);
  return tab.playwright.domSnapshot();
}
async function screenshot(tab: T.BrowserTab) {
  if (tab.screenshot === undefined)
    throw new Error(`Tab ${tab.id} does not support screenshots.`);
  return tab.screenshot();
}
function accessibility(tab: T.BrowserTab) {
  if (tab.ax === undefined)
    throw new Error(
      "This tab does not support accessibility input. Use its Playwright API.",
    );
  return tab.ax;
}
function requireInputIndex(index: number | null): void {
  if (index !== null && (!Number.isInteger(index) || index < 0)) {
    throw new Error(
      "Browser input requires an element index from the latest AX snapshot, or null to use current focus.",
    );
  }
}
function stateOptions(options?: T.StateOptions) {
  const disableDiffing = options?.disableDiffing;
  if (disableDiffing !== undefined) return { disableDiffing };
}

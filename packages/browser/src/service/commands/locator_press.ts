import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
import { inputTimeout } from "../input/input";
import { keyboardDispatch } from "../input";
import { dispatchClipboardKeypress } from "../clipboard/operations";
import type { ClipboardContext } from "../clipboard/operations";
import type { LocatorCommandContext, LocatorCommandPayload } from "./locator";
import type { PlaywrightService } from "../playwright/service";
export type LocatorPressContext = LocatorCommandContext &
  ClipboardContext & {
    cdp: Parameters<typeof keyboardDispatch.dispatchKeys>[0];
    playwright: LocatorCommandContext["playwright"] &
      Pick<PlaywrightService, "focusLocator">;
  };
export interface LocatorPressPayload extends LocatorCommandPayload {
  value?: unknown;
  max?: number;
}
/** Original Af. Clipboard shortcuts are intercepted before physical key dispatch. */
export async function pressLocator(
  payload: LocatorPressPayload,
  context: LocatorPressContext,
) {
  if (typeof payload.value !== "string" || !payload.value)
    throw new Error("playwright_locator_press requires value");
  const tabId = positiveTabId(payload.tab_id),
    deadlineMs = Date.now() + inputTimeout(payload),
    focusTarget = async () =>
      await context.playwright.focusLocator(payload, {
        requireEditable: false,
      });
  if (
    await dispatchClipboardKeypress({
      commandType: "playwright_locator_press",
      ctx: context,
      keypress: payload.value,
      tabId,
      focusTarget,
    })
  )
    return;
  const focused = await focusTarget();
  await keyboardDispatch.dispatchKeys(
    context.cdp,
    focused.target,
    payload.value,
    { deadlineMs, ...focused },
  );
}
/** Original zD. */
export const PlaywrightLocatorPressCommand = defineCommand(
  "playwright_locator_press",
  async (payload: LocatorPressPayload, context: LocatorPressContext) => {
    await context
      .acquireAuthority()
      .actInFrame(await context.security.currentTabUrl(Number(payload.tab_id)))
      .assert();
    await context.followSessionTab(Number(payload.tab_id));
    await pressLocator(payload, context);
    return {};
  },
);

import { defineCommand } from "./define_command";
import type { LocatorCommandContext, LocatorCommandPayload } from "./locator";
import type { PlaywrightService } from "../playwright/service";
import type { CdpTarget } from "../cdp/dispatch_helpers";
import { inputTimeout } from "../input/input";
import { keyboardDispatch } from "../input";
export interface LocatorActionPayload extends LocatorCommandPayload {
  checked?: unknown;
  selections?: unknown;
  value?: unknown;
}
export interface LocatorActionContext extends LocatorCommandContext {
  cdp: Parameters<typeof keyboardDispatch.dispatchTextCharacter>[0];
  playwright: LocatorCommandContext["playwright"] &
    Pick<
      PlaywrightService,
      | "readCheckedState"
      | "prepareSequentialInput"
      | "evaluateOnPlaywrightSelectorWithTarget"
    >;
}
/** Original Qte. */
export function sameInputTarget(first: CdpTarget, second: CdpTarget) {
  return (
    first.tabId === second.tabId &&
    first.sessionId === second.sessionId &&
    first.targetId === second.targetId
  );
}
/** Original b2/y2. */
export const PlaywrightLocatorSelectOptionCommand = defineCommand(
  "playwright_locator_select_option",
  async (payload: LocatorActionPayload, context: LocatorActionContext) => {
    await context
      .acquireAuthority()
      .actInFrame(await context.security.currentTabUrl(Number(payload.tab_id)))
      .assert();
    await context.followSessionTab(Number(payload.tab_id));
    await context.playwright.evaluateOnPlaywrightSelector(
      payload.tab_id,
      payload.selector,
      (element: any, injected: any, options: { selections: unknown }) => {
        const state = injected.elementState(element, "enabled");
        if (state.received === "error:notconnected")
          throw new Error("Element is not connected");
        if (!state.matches) throw new Error("Element is not enabled");
        const result = injected.selectOptions(element, options.selections);
        if (typeof result === "string" && result.startsWith("error:"))
          throw new Error(result);
        return true;
      },
      {
        arg: { selections: payload.selections ?? [] },
        timeoutMs: payload.timeout_ms,
      },
    );
    return {};
  },
);
export const PlaywrightLocatorSetCheckedCommand = defineCommand(
  "playwright_locator_set_checked",
  async (payload: LocatorActionPayload, context: LocatorActionContext) => {
    await context
      .acquireAuthority()
      .actInFrame(await context.security.currentTabUrl(Number(payload.tab_id)))
      .assert();
    await context.followSessionTab(Number(payload.tab_id));
    if (typeof payload.checked !== "boolean")
      throw new Error("playwright_locator_set_checked requires checked");
    const state = await context.playwright.readCheckedState(payload);
    if (state.checked === payload.checked) return {};
    if (state.isRadio && !payload.checked)
      throw new Error("Cannot uncheck a radio button");
    await context.playwright.clickLocator(payload, 1);
    if (
      (await context.playwright.readCheckedState(payload)).checked !==
      payload.checked
    )
      throw new Error(
        `Click did not change checked state to ${String(payload.checked)}`,
      );
    return {};
  },
);
/** Original g2. Unicode characters are dispatched with original zA keyboard implementation. */
export const PlaywrightLocatorPressSequentiallyCommand = defineCommand(
  "playwright_locator_press_sequentially",
  async (payload: LocatorActionPayload, context: LocatorActionContext) => {
    await context
      .acquireAuthority()
      .actInFrame(await context.security.currentTabUrl(Number(payload.tab_id)))
      .assert();
    await context.followSessionTab(Number(payload.tab_id));
    if (typeof payload.value !== "string")
      throw new Error(
        "playwright_locator_press_sequentially requires string value",
      );
    const deadlineMs =
        Date.now() +
        inputTimeout({ timeout_ms: payload.timeout_ms ?? 5000, max: 5000 }),
      prepared = await context.playwright.prepareSequentialInput(
        payload,
        deadlineMs,
      ),
      { target, targetToken } = prepared,
      characters = Array.from(payload.value);
    try {
      for (const [index, character] of characters.entries()) {
        const current =
          await context.playwright.evaluateOnPlaywrightSelectorWithTarget(
            payload.tab_id,
            payload.selector,
            (
              element: any,
              injected: any,
              options: { targetToken: string },
              scope: any,
            ) => {
              const retargeted =
                typeof injected.retarget === "function"
                  ? injected.retarget(element, "follow-label")
                  : element;
              if (retargeted == null) return false;
              const focused = (node: any) => {
                let current = node;
                while (current != null) {
                  const root = current.getRootNode?.();
                  if (root == null || root.activeElement !== current)
                    return false;
                  if (!("host" in root)) return true;
                  current = root.host;
                }
                return false;
              };
              return (
                Object.getOwnPropertyDescriptor(
                  retargeted,
                  "__codexPressSequentiallyTargetToken",
                )?.value === options.targetToken &&
                (retargeted.matches(":focus") || focused(retargeted)) &&
                scope.frameChain.every(({ element: frame }: any) =>
                  focused(frame),
                )
              );
            },
            {
              arg: { targetToken },
              deadlineMs,
              retry: false,
              timeoutMs: payload.timeout_ms,
            },
          );
        if (!current.result || !sameInputTarget(target, current.target))
          throw new Error(
            "pressSequentially target changed or lost focus while typing",
          );
        await keyboardDispatch.dispatchTextCharacter(
          context.cdp,
          target,
          character,
          { deadlineMs, ...prepared },
        );
        if (index < characters.length - 1)
          await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }
    } finally {
      await context.playwright
        .evaluateOnPlaywrightSelector(
          payload.tab_id,
          payload.selector,
          (element: any, injected: any, options: { targetToken: string }) => {
            const target =
              typeof injected.retarget === "function"
                ? injected.retarget(element, "follow-label")
                : element;
            if (
              target != null &&
              Object.getOwnPropertyDescriptor(
                target,
                "__codexPressSequentiallyTargetToken",
              )?.value === options.targetToken
            )
              Reflect.deleteProperty(
                target,
                "__codexPressSequentiallyTargetToken",
              );
          },
          { arg: { targetToken }, retry: false, timeoutMs: 500 },
        )
        .catch(() => {});
    }
    return {};
  },
);

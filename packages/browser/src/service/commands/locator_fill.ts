import { defineCommand } from "./define_command";
import type { LocatorCommandContext, LocatorCommandPayload } from "./locator";
import type { PlaywrightService } from "../playwright/service";
import type { TextPasteContext, createTextPaste } from "../input/text_paste";
export type LocatorFillContext = LocatorCommandContext &
  TextPasteContext & {
    playwright: LocatorCommandContext["playwright"] &
      TextPasteContext["playwright"] &
      Pick<PlaywrightService, "prepareLocatorFill" | "focusLocator">;
  };
/** Original kv. Exact Hs text paste is supplied at assembly with its markdown renderer dependency. */
export function createLocatorFillCommand(
  typeText: ReturnType<typeof createTextPaste>["typeText"],
) {
  const command = defineCommand(
    "playwright_locator_fill",
    async (
      payload: LocatorCommandPayload & { value?: unknown; replace?: boolean },
      context: LocatorFillContext,
    ) => {
      await context
        .acquireAuthority()
        .actInFrame(
          await context.security.currentTabUrl(Number(payload.tab_id)),
        )
        .assert();
      await context.followSessionTab(Number(payload.tab_id));
      if (typeof payload.value !== "string")
        throw new Error("playwright_locator_fill requires string value");
      const replace = payload.replace !== false,
        prepared = replace
          ? await context.playwright.prepareLocatorFill(payload, payload.value)
          : await context.playwright.focusLocator(payload, {
              requireEditable: true,
            });
      if ("result" in prepared && prepared.result === "done") return {};
      await typeText(
        {
          ...prepared,
          includeRichText: false,
          replaceInputValue: replace,
          tab_id: payload.tab_id,
          text: payload.value,
        },
        context,
        command.type,
      );
      return {};
    },
  );
  return command;
}

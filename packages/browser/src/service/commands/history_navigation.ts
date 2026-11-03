import { defineCommand } from "./define_command";
export interface HistoryNavigationPayload {
  tab_id: unknown;
  timeout_ms?: number;
}
export interface HistoryNavigationContext {
  acquireAuthority(): {
    actInFrame(url: unknown): { assert(): Promise<unknown> };
  };
  security: { currentTabUrl(tabId: number): Promise<unknown> };
  followSessionTab(tabId: number): Promise<unknown>;
  cdp: {
    call(tabId: number, method: string, params?: object): Promise<any>;
    waitForPageLoadEvent(
      tabId: number,
      options: { timeoutMs: number },
    ): Promise<unknown>;
  };
}
/** Original FN/LN/UN share this order, including authority/follow before numeric validation. */
function navigationCommand(action: "back" | "forward" | "reload") {
  const commandType = `navigate_tab_${action}`;
  return defineCommand(
    commandType,
    async (
      payload: HistoryNavigationPayload,
      context: HistoryNavigationContext,
    ) => {
      const tabId = Number(payload.tab_id);
      await context
        .acquireAuthority()
        .actInFrame(await context.security.currentTabUrl(tabId))
        .assert();
      await context.followSessionTab(tabId);
      if (!Number.isInteger(tabId) || tabId <= 0)
        throw new Error(`${commandType} requires a positive integer tab_id`);
      const timeoutMs =
        typeof payload.timeout_ms === "number" ? payload.timeout_ms : 10000;
      if (action === "reload") {
        const loaded = context.cdp.waitForPageLoadEvent(tabId, { timeoutMs });
        await context.cdp.call(tabId, "Page.reload", {});
        await loaded;
        return {};
      }
      const history = await context.cdp.call(
        tabId,
        "Page.getNavigationHistory",
      );
      const entry =
        history.entries[history.currentIndex + (action === "back" ? -1 : 1)];
      if (!entry)
        throw new Error(
          action === "back"
            ? "Cannot navigate back: no previous page in history."
            : "Cannot navigate forward: no next page in history.",
        );
      const loaded = context.cdp.waitForPageLoadEvent(tabId, { timeoutMs });
      await context.cdp.call(tabId, "Page.navigateToHistoryEntry", {
        entryId: entry.id,
      });
      await loaded;
      return {};
    },
  );
}
export const NavigateTabBackCommand = navigationCommand("back");
export const NavigateTabForwardCommand = navigationCommand("forward");
export const NavigateTabReloadCommand = navigationCommand("reload");

import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
import type { BrowserDev } from "../context/dev";
export interface DevLogsContext {
  acquireAuthority(): {
    observeContent(url: unknown): { assert(): Promise<unknown> };
  };
  security: { currentTabUrl(tabId: number): Promise<unknown> };
  dev: Pick<BrowserDev, "logs">;
}
/** Original dF. Only public log fields are projected into the command response. */
export const TabDevLogsCommand = defineCommand(
  "tab_dev_logs",
  async (
    payload: Omit<Parameters<BrowserDev["logs"]>[0], "tabId"> & {
      tab_id: unknown;
    },
    context: DevLogsContext,
  ) => {
    const tabId = positiveTabId(payload.tab_id);
    await context
      .acquireAuthority()
      .observeContent(await context.security.currentTabUrl(tabId))
      .assert();
    return {
      logs: (
        await context.dev.logs({
          tabId,
          filter: payload.filter,
          levels: payload.levels,
          limit: payload.limit,
        })
      ).map(({ level, message, timestamp, url }) => ({
        level,
        message,
        timestamp,
        ...(url == null ? {} : { url }),
      })),
    };
  },
);

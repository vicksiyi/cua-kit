import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
import { inputTimeout } from "../input/input";
import type { Downloads } from "../context/downloads";
export interface DownloadCommandContext {
  acquireAuthority(): {
    observeContent(url: unknown): { assert(): Promise<unknown> };
    actInFrame(url: unknown): { assert(): Promise<unknown> };
  };
  security: { currentTabUrl(tabId: number): Promise<unknown> };
  downloads: Pick<
    Downloads,
    "getPath" | "withDownload" | "enableDownload" | "waitForDownload"
  >;
  finishDownloadSetup(): unknown;
}
/** Original o2: authority precedes tab and download id validation. */
export const PlaywrightDownloadPathCommand = defineCommand(
  "playwright_download_path",
  async (
    payload: { tab_id: unknown; download_id?: unknown },
    context: DownloadCommandContext,
  ) => {
    await context
      .acquireAuthority()
      .observeContent(
        await context.security.currentTabUrl(Number(payload.tab_id)),
      )
      .assert();
    positiveTabId(payload.tab_id);
    if (
      typeof payload.download_id !== "string" ||
      payload.download_id.length === 0
    )
      throw new Error("playwright_download_path requires a download_id");
    return { path: context.downloads.getPath(payload.download_id) };
  },
);
/** Original Wh. Setup completion is synchronous and occurs after enabling downloads. */
export const PlaywrightWaitForDownloadCommand = defineCommand(
  "playwright_wait_for_download",
  async (
    payload: { tab_id: unknown; timeout_ms?: number },
    context: DownloadCommandContext,
  ) => {
    const tabId = positiveTabId(payload.tab_id);
    await context
      .acquireAuthority()
      .actInFrame(await context.security.currentTabUrl(tabId))
      .assert();
    return await context.downloads.withDownload(tabId, async () => {
      await context.downloads.enableDownload(tabId);
      context.finishDownloadSetup();
      return {
        download_id: (
          await context.downloads.waitForDownload(
            tabId,
            inputTimeout({
              timeout_ms: payload.timeout_ms ?? 120000,
              max: 120000,
            }),
          )
        ).id,
      };
    });
  },
);

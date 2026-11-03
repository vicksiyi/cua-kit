import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
import { PageAssetsBundle, PageAssetsList } from "../../commands/page_assets";
import type { createPageAssetsClass } from "../context/page_assets";
type Assets = InstanceType<ReturnType<typeof createPageAssetsClass>>;
export interface PageAssetCommandContext {
  acquireAuthority(): {
    observeContent(url: string | undefined): { assert(): Promise<unknown> };
  };
  security: { currentTabUrl(tabId: number): Promise<string> };
  tabs: { get(tabId: number): Promise<{ url?: string }> };
  pageAssets: Pick<Assets, "list" | "bundle">;
}
/** Original OF: tab lookup precedes observation authority, using its captured URL. */
export const TabPageAssetsBundleCommand = defineCommand(
  PageAssetsBundle,
  async (
    payload: Omit<Parameters<Assets["bundle"]>[0], "tabId" | "documentUrl"> & {
      tab_id: unknown;
    },
    context: PageAssetCommandContext,
  ) => {
    const tabId = positiveTabId(payload.tab_id),
      tab = await context.tabs.get(tabId);
    await context.acquireAuthority().observeContent(tab.url).assert();
    return await context.pageAssets.bundle({
      assetIds: payload.assetIds,
      documentUrl: tab.url,
      inventoryId: payload.inventoryId,
      kinds: payload.kinds,
      tabId,
    });
  },
);
/** Original MF: observation authority precedes tab lookup. */
export const TabPageAssetsListCommand = defineCommand(
  PageAssetsList,
  async (payload: { tab_id: unknown }, context: PageAssetCommandContext) => {
    const tabId = positiveTabId(payload.tab_id);
    await context
      .acquireAuthority()
      .observeContent(await context.security.currentTabUrl(tabId))
      .assert();
    const tab = await context.tabs.get(tabId);
    return await context.pageAssets.list({ documentUrl: tab.url, tabId });
  },
);

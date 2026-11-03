import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
import { inputTimeout } from "../input/input";
import type { Downloads } from "../context/downloads";
interface MediaResult {
  source: string;
  filename: string | null;
}
interface MediaDownloadContext {
  acquireAuthority(): {
    actInFrame(url: unknown): { assert(): Promise<unknown> };
  };
  security: { currentTabUrl(tabId: number): Promise<unknown> };
  downloads: Pick<
    Downloads,
    "withDownload" | "enableMediaDownload" | "waitForDownload"
  >;
  cdp: { call(tabId: number, method: string): Promise<any> };
  playwright: {
    evaluateOnPlaywrightSelectorWithTarget(
      tabId: string | number,
      selector: string,
      fn: (element: any) => MediaResult,
      options: { includeFrameIdentity: boolean; timeoutMs: number },
    ): Promise<{
      result: MediaResult;
      frameIdentity?: { frameId: string } | null;
    }>;
    evaluateOnPlaywrightSelector(
      tabId: string | number,
      selector: string,
      fn: (element: any, helper: any, arg: MediaResult) => boolean,
      options: { arg: MediaResult; timeoutMs: number },
    ): Promise<unknown>;
  };
}
/** Original l2. Download permission/lifecycle stay in the reconstructed Downloads implementation. */
export const PlaywrightLocatorDownloadMediaCommand = defineCommand(
  "playwright_locator_download_media",
  async (
    payload: { tab_id: string | number; selector: string; timeout_ms?: number },
    context: MediaDownloadContext,
  ) => {
    const tabId = positiveTabId(payload.tab_id);
    await context
      .acquireAuthority()
      .actInFrame(await context.security.currentTabUrl(tabId))
      .assert();
    return await context.downloads.withDownload(tabId, async () => {
      const timeout = inputTimeout({
        timeout_ms: payload.timeout_ms ?? 120000,
        max: 120000,
      });
      const { result, frameIdentity } =
        await context.playwright.evaluateOnPlaywrightSelectorWithTarget(
          payload.tab_id,
          payload.selector,
          (element) => {
            element.scrollIntoView({ block: "center", inline: "nearest" });
            const media =
              element.closest?.("img, video, source, a[href]") ??
              element.querySelector?.("img, video, source, a[href]") ??
              element;
            const property = (node: any, name: string) => {
              if (name === "src" && node.getAttribute("src")?.trim() === "")
                return null;
              const value = node[name];
              return typeof value === "string" && value.length > 0
                ? value
                : null;
            };
            const source =
              property(media, "currentSrc") ??
              property(media, "src") ??
              property(media, "href") ??
              "";
            return {
              source,
              filename:
                source.startsWith("blob:") && media.localName === "a"
                  ? property(media, "download")
                  : null,
            };
          },
          { includeFrameIdentity: true, timeoutMs: timeout },
        );
      const { source } = result;
      if (!source)
        throw new Error("Matched element does not expose a downloadable URL");
      if (frameIdentity == null)
        throw new Error("Could not determine the media frame");
      if (new URL(source).protocol === "blob:") {
        const { frameTree } = await context.cdp.call(
          tabId,
          "Page.getFrameTree",
        );
        if (frameIdentity.frameId !== frameTree.frame.id)
          throw new Error(
            "Blob downloads are not supported in embedded frames.",
          );
      }
      await context.downloads.enableMediaDownload(
        tabId,
        source,
        frameIdentity.frameId,
      );
      await context.playwright.evaluateOnPlaywrightSelector(
        payload.tab_id,
        payload.selector,
        (element, _helper, { source, filename }) => {
          const link = element.ownerDocument.createElement("a");
          link.href = source;
          link.download =
            filename ?? (source.split("/").pop()?.split("?")[0] || "download");
          link.rel = "noopener";
          link.style.display = "none";
          element.ownerDocument.body.appendChild(link);
          link.click();
          link.remove();
          return true;
        },
        { arg: result, timeoutMs: timeout },
      );
      return {
        path: (await context.downloads.waitForDownload(tabId, timeout))
          .filename,
      };
    });
  },
);

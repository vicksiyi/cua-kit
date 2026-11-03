import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
import { youtubeVideoId } from "../context/tab_context";
import { readYoutubeTranscript } from "../content/youtube_transcript";
interface Context {
  acquireAuthority(): {
    observeContent(url: unknown): { assert(): Promise<unknown> };
  };
  security: { currentTabUrl(tabId: number): Promise<unknown> };
  tabs: { get(tabId: number): Promise<{ url?: string | null }> };
  cdp: {
    evaluateJavascript(
      tabId: number,
      expression: string,
      options: { awaitPromise: boolean },
    ): Promise<any>;
  };
  filesystem: {
    tmpDir: string;
    mkdir(path: string, options: { recursive: boolean }): Promise<unknown>;
    writeFile(path: string, bytes: Uint8Array): Promise<unknown>;
  };
}
/** Original cF. Validate video identity in captured response and again before writing. */
export const TabContentExportYouTubeTranscriptCommand = defineCommand(
  "tab_content_export_youtube_transcript",
  async (payload: { tab_id: unknown }, context: Context) => {
    const tabId = positiveTabId(payload.tab_id);
    await context
      .acquireAuthority()
      .observeContent(await context.security.currentTabUrl(tabId))
      .assert();
    const tab = await context.tabs.get(tabId),
      videoId = youtubeVideoId(tab.url);
    if (videoId == null)
      throw new Error("Tab is not a supported YouTube watch page");
    const result = await readYoutubeTranscript(
      videoId,
      async (fn, id, limits) =>
        await context.cdp.evaluateJavascript(
          tabId,
          `(${fn.toString()})(${JSON.stringify(id)},${JSON.stringify(limits)})`,
          { awaitPromise: true },
        ),
    );
    if (result == null || youtubeVideoId(result.pageUrl) !== videoId)
      throw new Error("No transcript is available for this YouTube video");
    const current = await context.tabs.get(tabId);
    if (youtubeVideoId(current.url) !== videoId)
      throw new Error(
        "YouTube video changed before its transcript was exported",
      );
    const directory = `${context.filesystem.tmpDir}/browser-use/exports`;
    await context.filesystem.mkdir(directory, { recursive: true });
    const path = `${directory}/youtube-${videoId}-${crypto.randomUUID()}.txt`;
    await context.filesystem.writeFile(
      path,
      new TextEncoder().encode(result.text),
    );
    return { path };
  },
);

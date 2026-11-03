import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
import { inputTimeout } from "../input/input";
import type { FrameEvent } from "../cdp/frame_methods";
import type { WaitForCdpEventOptions } from "../cdp/event_wait";
import {
  SECURITY_REJECTED_PREFIX,
  SECURITY_REJECTED_SUFFIX,
} from "../errors/browser_security_error";
export interface FileChooserRecord {
  tabId: number;
  backendNodeId: number;
  isMultiple: boolean;
}
export interface FileChooserContext {
  acquireAuthority(): {
    observeContent(url: unknown): { assert(): Promise<unknown> };
    actInFrame(url: unknown): { assert(): Promise<unknown> };
    uploadFiles(url: unknown): { assert(): Promise<unknown> };
  };
  security: {
    currentTabUrl(tabId: number): Promise<unknown>;
    currentTabFileTransferUrl(
      tabId: number,
      direction: "upload",
    ): Promise<unknown>;
  };
  clientInfo?: { family?: string };
  cdp: {
    fileChoosersById: Map<string, FileChooserRecord>;
    call(tabId: number, method: string, params?: object): Promise<unknown>;
    waitForEvent(
      tabId: number,
      predicate: (event: FrameEvent) => boolean,
      options: WaitForCdpEventOptions,
    ): Promise<FrameEvent>;
  };
}
const positiveNode = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;
/** Original ere/tre/x2/E2/rre. Nested targets are rejected after capturing the event. */
export function fileChooserFromEvent(
  tabId: number,
  event: FrameEvent,
): FileChooserRecord {
  const params = event.params;
  if (!positiveNode(params?.backendNodeId))
    throw new Error("File chooser event did not include a backend node id");
  if (event.source.tabId != null && event.source.tabId !== tabId)
    throw new Error("File chooser event belongs to a different tab");
  if (event.source.sessionId != null || event.source.targetId != null)
    throw new Error(
      `${SECURITY_REJECTED_PREFIX} File uploads in out-of-process frames are not supported.${SECURITY_REJECTED_SUFFIX}`,
    );
  return {
    backendNodeId: params.backendNodeId,
    isMultiple: params.mode === "selectMultiple",
    tabId,
  };
}
export const PlaywrightWaitForFileChooserCommand = defineCommand(
  "playwright_wait_for_file_chooser",
  async (
    payload: { tab_id: unknown; timeout_ms?: number },
    context: FileChooserContext,
  ) => {
    const tabId = positiveTabId(payload.tab_id);
    await context
      .acquireAuthority()
      .observeContent(await context.security.currentTabUrl(tabId))
      .assert();
    const timeoutMs = inputTimeout({ ...payload, max: 120000 });
    try {
      const event = await context.cdp.waitForEvent(
        tabId,
        (event) =>
          event.method === "Page.fileChooserOpened" &&
          positiveNode(event.params?.backendNodeId),
        {
          timeoutMs,
          timeoutMessage: `Timed out after ${timeoutMs}ms waiting for file chooser.`,
          action: async () => {
            await context.cdp.call(tabId, "Page.enable");
            await context.cdp.call(
              tabId,
              "Page.setInterceptFileChooserDialog",
              { enabled: true },
            );
          },
        },
      );
      const id = crypto.randomUUID(),
        chooser = fileChooserFromEvent(tabId, event);
      context.cdp.fileChoosersById.set(id, chooser);
      return { file_chooser_id: id, is_multiple: chooser.isMultiple };
    } finally {
      await context.cdp
        .call(tabId, "Page.setInterceptFileChooserDialog", { enabled: false })
        .catch(() => {});
    }
  },
);
/** Original Jte. */
export function fileUploadNotAllowed(error: unknown) {
  const message =
    typeof error === "string"
      ? error
      : typeof error === "object" && error != null && "message" in error
        ? error.message
        : undefined;
  if (message === "Not allowed") return true;
  if (typeof message !== "string") return false;
  try {
    const parsed = JSON.parse(message);
    return (
      typeof parsed === "object" &&
      parsed != null &&
      "code" in parsed &&
      parsed.code === -32000 &&
      "message" in parsed &&
      parsed.message === "Not allowed"
    );
  } catch {
    return false;
  }
}
/** Original i2, with ks browser family catalog supplied explicitly. */
export function createFileChooserSetFilesCommand(
  browserFamily: (info: FileChooserContext["clientInfo"]) => {
    displayName: string;
    extensionManagementUrl: string;
  },
) {
  return defineCommand(
    "playwright_file_chooser_set_files",
    async (
      payload: { tab_id: unknown; file_chooser_id: string; files: string[] },
      context: FileChooserContext,
    ) => {
      const tabId = positiveTabId(payload.tab_id);
      await context
        .acquireAuthority()
        .actInFrame(await context.security.currentTabUrl(tabId))
        .assert();
      const chooser = context.cdp.fileChoosersById.get(payload.file_chooser_id);
      if (chooser == null)
        throw new Error(`Unknown file chooser id "${payload.file_chooser_id}"`);
      if (chooser.tabId !== tabId)
        throw new Error(
          `File chooser "${payload.file_chooser_id}" belongs to tab ${chooser.tabId}`,
        );
      if (payload.files.length === 0)
        throw new Error("fileChooser.setFiles requires at least one file");
      if (!chooser.isMultiple && payload.files.length > 1)
        throw new Error("File chooser does not accept multiple files");
      const url = await context.security.currentTabFileTransferUrl(
        tabId,
        "upload",
      );
      await context.acquireAuthority().uploadFiles(url).assert();
      try {
        await context.cdp.call(tabId, "DOM.setFileInputFiles", {
          backendNodeId: chooser.backendNodeId,
          files: payload.files,
        });
      } catch (error) {
        if (fileUploadNotAllowed(error)) {
          const family = browserFamily(context.clientInfo);
          throw new Error(
            `To enable file upload, go to ${family.extensionManagementUrl} in ${family.displayName}, click Details under the ChatGPT extension, and enable "Allow access to file URLs." See [here](https://developers.openai.com/codex/app/chrome-extension#upload-files) for details.`,
          );
        }
        throw error;
      }
      context.cdp.fileChoosersById.delete(payload.file_chooser_id);
      return {};
    },
  );
}

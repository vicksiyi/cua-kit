import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
import type { BrowserClipboard } from "../context/browser_clipboard";
export interface ClipboardCommandPayload {
  tab_id: unknown;
  items?: unknown;
  text?: unknown;
}
type Clipboard = InstanceType<typeof BrowserClipboard>;
export interface ClipboardCommandContext {
  acquireAuthority(): {
    observeContent(url: unknown): { assert(): Promise<unknown> };
    actInFrame(url: unknown): { assert(): Promise<unknown> };
  };
  security: { currentTabUrl(tabId: number): Promise<unknown> };
  cdp: Parameters<Clipboard["ensurePageClipboard"]>[0];
  clipboard: Pick<
    Clipboard,
    "ensurePageClipboard" | "runExclusive" | "read" | "write"
  >;
}
/** Original B2/are: validate the tab before acquiring observation authority. */
export const TabClipboardReadCommand = defineCommand(
  "tab_clipboard_read",
  async (
    payload: ClipboardCommandPayload,
    context: ClipboardCommandContext,
  ) => {
    const tabId = positiveTabId(payload.tab_id);
    await context
      .acquireAuthority()
      .observeContent(await context.security.currentTabUrl(tabId))
      .assert();
    await context.clipboard.ensurePageClipboard(context.cdp, { tabId });
    return await context.clipboard.runExclusive(() => ({
      items: context.clipboard.read(),
    }));
  },
);
/** Original D2/ure: the first plain entry wins, even if it has no text property. */
export const TabClipboardReadTextCommand = defineCommand(
  "tab_clipboard_read_text",
  async (
    payload: ClipboardCommandPayload,
    context: ClipboardCommandContext,
  ) => {
    const tabId = positiveTabId(payload.tab_id);
    await context
      .acquireAuthority()
      .observeContent(await context.security.currentTabUrl(tabId))
      .assert();
    await context.clipboard.ensurePageClipboard(context.cdp, { tabId });
    return await context.clipboard.runExclusive(() => {
      const entry = context.clipboard
        .read()
        .flatMap((item) => item.entries)
        .find((entry) => entry.mime_type === "text/plain");
      return {
        text: (entry && "text" in entry ? entry.text : undefined) ?? "",
      };
    });
  },
);
/** Original M2/O2: item validation remains inside the exclusive store write. */
export const TabClipboardWriteCommand = defineCommand(
  "tab_clipboard_write",
  async (
    payload: ClipboardCommandPayload,
    context: ClipboardCommandContext,
  ) => {
    const tabId = positiveTabId(payload.tab_id);
    await context
      .acquireAuthority()
      .actInFrame(await context.security.currentTabUrl(tabId))
      .assert();
    await context.clipboard.ensurePageClipboard(context.cdp, { tabId });
    return await context.clipboard.runExclusive(() => {
      context.clipboard.write(payload.items, "tab_clipboard_write");
      return {};
    });
  },
);
/** Original N2/Ov: text validation follows authority and precedes bridge installation. */
export const TabClipboardWriteTextCommand = defineCommand(
  "tab_clipboard_write_text",
  async (
    payload: ClipboardCommandPayload,
    context: ClipboardCommandContext,
  ) => {
    const tabId = positiveTabId(payload.tab_id);
    await context
      .acquireAuthority()
      .actInFrame(await context.security.currentTabUrl(tabId))
      .assert();
    if (typeof payload.text !== "string")
      throw new Error("tab_clipboard_write_text requires text");
    await context.clipboard.ensurePageClipboard(context.cdp, { tabId });
    return await context.clipboard.runExclusive(() => {
      context.clipboard.write(
        [
          {
            entries: [{ mime_type: "text/plain", text: payload.text }],
            presentation_style: "unspecified",
          },
        ],
        "tab_clipboard_write_text",
      );
      return {};
    });
  },
);

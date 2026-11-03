import { positiveTabId } from "../tab_id";
import { executeClipboardPage } from "../clipboard/page_execution";
import type { ClipboardPageContext } from "../clipboard/page_execution";
import { pageClipboardOperation } from "../clipboard/page_operations";
import type { CdpTarget } from "../cdp/dispatch_helpers";
import type { ClipboardItem } from "../context/clipboard";
export interface TextPasteContext extends ClipboardPageContext {
  clipboard: ClipboardPageContext["clipboard"] & {
    runExclusive<T>(run: () => Promise<T>): Promise<T>;
  };
  playwright: { executionPolicy: { documentOnly?: boolean } };
  tabs: { get(tabId: number): Promise<{ url?: string | null }> };
}
export interface TextPasteRequest {
  text: unknown;
  tab_id: unknown;
  includeRichText?: boolean;
  inputTargetToken?: string;
  replaceInputValue?: boolean;
  executionContextId?: number;
  target?: CdpTarget;
}
/** Original H9/U9. This intentionally does not require a Google document id. */
export function inputDocumentKind(value: string | null | undefined) {
  if (value == null) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.host !== "docs.google.com") return null;
  const kind = url.pathname.split("/").filter(Boolean)[0];
  return kind !== "document" &&
    kind !== "spreadsheets" &&
    kind !== "presentation"
    ? null
    : kind;
}
/** Original r_/j9. */
export function whitespaceHtml(value: Iterable<string>, reverse = false) {
  const result: string[] = [];
  for (const character of value) {
    if (/\r|\n|\u2028|\u2029/.test(character)) {
      result.push("<br>");
      continue;
    }
    if (/\s/.test(character)) {
      result.push("&nbsp;");
      continue;
    }
    break;
  }
  if (reverse) result.reverse();
  return result.join("");
}
export function preserveMarkdownWhitespace(html: string, text: string) {
  let result = html.trim();
  if (text.trim().length === 0) return whitespaceHtml(text);
  const prefix = whitespaceHtml(text),
    suffix = whitespaceHtml(Array.from(text).reverse(), true),
    open = "<p>",
    close = "</p>";
  if (result.startsWith(open) && result.endsWith(close)) {
    const inner = result.slice(open.length, -close.length);
    if (!inner.includes(open)) result = prefix + inner + suffix;
  }
  return result === html.trim() ? prefix + result + suffix : result;
}
/** Original N9 configuration. The exact bundled markdown-it renderer is an explicit dependency. */
export const textMarkdownOptions = {
  breaks: true,
  html: false,
  linkify: false,
  typographer: false,
};
/** Original Hs/F9/L9/U9/q9 assembled with existing clipboard execution; no renderer substitute. */
export function createTextPaste(markdown: { render(text: string): string }) {
  function clipboardItems(text: string, rich: boolean): ClipboardItem[] {
    const entries = [{ mime_type: "text/plain", text }];
    if (rich)
      entries.push({
        mime_type: "text/html",
        text: preserveMarkdownWhitespace(markdown.render(text), text),
      });
    return [{ entries, presentation_style: "unspecified" }];
  }
  async function typeText(
    request: TextPasteRequest,
    context: TextPasteContext,
    commandType: string,
  ) {
    if (typeof request.text !== "string")
      throw new Error(`${commandType} requires text`);
    const tabId = positiveTabId(request.tab_id),
      rich =
        request.includeRichText !== false &&
        inputDocumentKind((await context.tabs.get(tabId)).url) !==
          "spreadsheets",
      items = clipboardItems(request.text, rich);
    await context.clipboard.runExclusive(async () => {
      await executeClipboardPage({
        args: {
          action: "paste",
          clipboardItems: items,
          ...(request.inputTargetToken == null
            ? {}
            : { iabInputTargetToken: request.inputTargetToken }),
          replaceInputValue: request.replaceInputValue,
          documentOnly: context.playwright.executionPolicy.documentOnly,
          requireDocumentFocus: request.executionContextId != null,
          ...(rich ? { richTextFallback: true } : {}),
        },
        commandType,
        ctx: context,
        executionContextId: request.executionContextId,
        pageFunction: pageClipboardOperation,
        tabId,
        ...(request.target != null ? { target: request.target } : {}),
      });
    });
  }
  return { clipboardItems, typeText };
}

import { positiveTabId } from "../tab_id";
import { clipboardKeys } from "../input/keyboard_dispatch";
import { clipboardShortcutError } from "../input/keyboard_keys";
import type { ClipboardItem, ClipboardStore } from "../context/clipboard";
import { resolveClipboardFocus } from "./focused_frame";
import type { ClipboardFocusTarget } from "./focused_frame";
import { executeClipboardPage, credentialFieldPolicy } from "./page_execution";
import type { ClipboardPageContext } from "./page_execution";
import { pageClipboardOperation, commitClipboardCut } from "./page_operations";
export type ClipboardContext = ClipboardPageContext &
  Parameters<typeof resolveClipboardFocus>[0] & {
    cdp: { platform: string };
    clipboard: ClipboardStore & {
      runExclusive<T>(run: () => Promise<T>): Promise<T>;
    };
  };
export interface ClipboardOperationRequest {
  action: string;
  commandType: string;
  ctx: ClipboardContext;
  focusTarget?: (
    requireEditable: boolean,
  ) => Promise<ClipboardFocusTarget | undefined>;
  items?: ClipboardItem[];
  tabId: string | number;
}
/** Original oo: intercept clipboard shortcuts before physical key dispatch. */
export async function dispatchClipboardKeypress(
  request: Omit<ClipboardOperationRequest, "action"> & {
    keypress: string | string[];
  },
): Promise<boolean> {
  const action = clipboardKeys(request.keypress, request.ctx.cdp.platform);
  if (action == null) return false;
  if (action === "blocked") throw new Error(clipboardShortcutError);
  await runClipboardOperation({ ...request, action });
  return true;
}
/** Original Zy: serialize focus/read/write/page execution and commit cuts only after a successful host write. */
export async function runClipboardOperation({
  action,
  commandType,
  ctx,
  focusTarget,
  items,
  tabId,
}: ClipboardOperationRequest): Promise<void> {
  const id = positiveTabId(tabId);
  await ctx.clipboard.runExclusive(async () => {
    const initial = await focusTarget?.(
      action === "paste" || action === "paste-plain-text",
    );
    const focused = await resolveClipboardFocus(ctx, id, initial);
    if (items != null) ctx.clipboard.write(items, commandType);
    let args: {
      action: string;
      clipboardItems: ClipboardItem[];
      cutToken?: string;
    };
    switch (action) {
      case "paste":
        args = { action, clipboardItems: ctx.clipboard.read() };
        break;
      case "paste-plain-text": {
        const clipboardItems = ctx.clipboard.read();
        for (const item of clipboardItems)
          item.entries = item.entries.filter(
            (entry) => entry.mime_type === "text/plain",
          );
        args = { action: "paste", clipboardItems };
        break;
      }
      case "copy":
        args = { action, clipboardItems: [] };
        break;
      case "cut":
        args = { action, clipboardItems: [], cutToken: crypto.randomUUID() };
        break;
      default:
        throw new Error(
          `Browser Use encountered an unsupported clipboard shortcut: ${action}`,
        );
    }
    const result = await executeClipboardPage({
      args: {
        ...args,
        protectedCredentialFieldPolicy: credentialFieldPolicy,
        clipboardItems: args.clipboardItems.filter(
          (item) => item.entries.length > 0,
        ),
        iabInputTargetToken: initial?.inputTargetToken,
      },
      commandType,
      ctx,
      executionContextId: focused.executionContextId,
      pageFunction: pageClipboardOperation,
      tabId: id,
      target: focused.target,
    });
    if (args.action !== "paste" && result.items != null) {
      ctx.clipboard.write(result.items, commandType);
      if (args.action === "cut" && result.cutToken != null)
        await executeClipboardPage({
          args: { cutToken: result.cutToken },
          commandType,
          ctx,
          executionContextId: focused.executionContextId,
          pageFunction: commitClipboardCut,
          tabId: id,
          target: focused.target,
        });
    }
  });
}
export const clipboardOperations = {
  run: runClipboardOperation,
  keypress: dispatchClipboardKeypress,
};

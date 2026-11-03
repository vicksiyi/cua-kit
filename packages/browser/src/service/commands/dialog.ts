import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
import { handleJavaScriptDialog } from "../accessibility/dialog_actions";
type DialogContext = Parameters<typeof handleJavaScriptDialog>[1];
export type DialogCommandContext = DialogContext & {
  acquireAuthority(): {
    observeContent(url: unknown): { assert(): Promise<unknown> };
    actInFrame(url: unknown): { assert(): Promise<unknown> };
  };
  security: { currentTabUrl(tabId: number): Promise<unknown> };
  followSessionTab(tabId: number): Promise<unknown>;
  cdp: { getJsDialog(tabId: number): { id: string; type: string } | undefined };
};
/** Original pF. The response intentionally excludes dialog message and prompt content. */
export const TabGetJsDialogCommand = defineCommand(
  "tab_get_js_dialog",
  async (payload: { tab_id: unknown }, context: DialogCommandContext) => {
    const tabId = positiveTabId(payload.tab_id);
    await context
      .acquireAuthority()
      .observeContent(await context.security.currentTabUrl(tabId))
      .assert();
    const dialog = context.cdp.getJsDialog(tabId);
    return {
      dialog: dialog == null ? null : { id: dialog.id, type: dialog.type },
    };
  },
);
/** Original L2: acquireAuthority runs before W, then follow-session before Mv. */
export const TabHandleJsDialogCommand = defineCommand(
  "tab_handle_js_dialog",
  async (
    payload: Parameters<typeof handleJavaScriptDialog>[0],
    context: DialogCommandContext,
  ) => {
    await context
      .acquireAuthority()
      .actInFrame(
        await context.security.currentTabUrl(positiveTabId(payload.tab_id)),
      )
      .assert();
    await context.followSessionTab(Number(payload.tab_id));
    await handleJavaScriptDialog(payload, context);
    return {};
  },
);

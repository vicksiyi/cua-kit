import type { CdpTarget } from "./dispatch_helpers";
import type { FrameEvent } from "./frame_methods";
export type DialogType = "alert" | "beforeunload" | "confirm" | "prompt";
export interface JsDialog {
  id: string;
  type: DialogType;
  message: string;
  promptText: string;
  target: CdpTarget;
  url: string;
}
/** Original Ite. */
export function isDialogType(value: unknown): value is DialogType {
  return (
    value === "alert" ||
    value === "beforeunload" ||
    value === "confirm" ||
    value === "prompt"
  );
}
/** Original kte; session targets compare only session identity. */
export function matchesDialogTarget(
  target: CdpTarget,
  source: Partial<CdpTarget>,
) {
  return target.sessionId != null
    ? target.sessionId === source.sessionId
    : target.tabId === source.tabId && source.sessionId == null;
}
export interface CdpDialogOwner {
  jsDialogsByTabId: Map<number, JsDialog>;
  jsDialogSequence: number;
  attachedTabIdForCdpEvent(source: Partial<CdpTarget>): number | undefined;
  hasBrowserAuthRawEventProtection(tabId: number): boolean;
  callTarget(
    target: CdpTarget,
    method: string,
    params: unknown,
  ): Promise<unknown>;
  activeJsDialog(tabId: unknown, dialogId: string): JsDialog;
  nextJsDialogId(): string;
  rememberJsDialog(event: FrameEvent): void;
  allowBeforeUnload(event: FrameEvent): Promise<void>;
  deleteJsDialogForTarget(source: Partial<CdpTarget>): void;
}
/** Original qh dialog state and event methods. Authentication protection remains an explicit owner dependency. */
export const dialogMethods = {
  getJsDialog(this: CdpDialogOwner, input: unknown) {
    const tabId = Number(input);
    if (!Number.isFinite(tabId))
      throw new Error("getJsDialog requires numeric tab_id");
    const dialog = this.jsDialogsByTabId.get(tabId);
    if (dialog != null) return { id: dialog.id, type: dialog.type };
  },
  activeJsDialog(this: CdpDialogOwner, input: unknown, dialogId: string) {
    const tabId = Number(input);
    if (!Number.isFinite(tabId))
      throw new Error("handleJsDialog requires numeric tab_id");
    if (!dialogId) throw new Error("handleJsDialog requires a dialog_id");
    const dialog = this.jsDialogsByTabId.get(tabId);
    if (dialog == null || dialog.id !== dialogId)
      throw new Error("JavaScript dialog is no longer active");
    return dialog;
  },
  updateJsDialogPrompt(
    this: CdpDialogOwner,
    input: unknown,
    dialogId: string,
    text: string,
  ) {
    const dialog = this.activeJsDialog(input, dialogId);
    if (dialog.type !== "prompt")
      throw new Error("Only prompt dialogs accept text");
    dialog.promptText = text;
  },
  deleteJsDialog(this: CdpDialogOwner, input: unknown, dialogId: string) {
    const tabId = Number(input);
    if (!Number.isFinite(tabId))
      throw new Error("handleJsDialog requires numeric tab_id");
    if (!dialogId) throw new Error("handleJsDialog requires a dialog_id");
    const dialog = this.jsDialogsByTabId.get(tabId);
    if (dialog != null && dialog.id === dialogId)
      this.jsDialogsByTabId.delete(tabId);
  },
  handleJavaScriptDialogEvent(this: CdpDialogOwner, event: FrameEvent) {
    if (event.method === "Page.javascriptDialogOpening") {
      const tabId = this.attachedTabIdForCdpEvent(event.source);
      if (tabId != null && this.hasBrowserAuthRawEventProtection(tabId)) {
        const target =
          typeof event.source.sessionId === "string"
            ? { tabId, sessionId: event.source.sessionId }
            : { tabId };
        this.callTarget(target, "Page.handleJavaScriptDialog", {
          accept: event.params.type === "alert",
        }).catch(() => {});
        return;
      }
      this.rememberJsDialog(event);
      if (event.params.type === "beforeunload") this.allowBeforeUnload(event);
      return;
    }
    if (event.method === "Page.javascriptDialogClosed")
      this.deleteJsDialogForTarget(event.source);
  },
  rememberJsDialog(this: CdpDialogOwner, event: FrameEvent) {
    const tabId = this.attachedTabIdForCdpEvent(event.source);
    if (tabId == null) return;
    const type = event.params.type;
    if (!isDialogType(type)) return;
    const target =
      typeof event.source.sessionId === "string"
        ? { tabId, sessionId: event.source.sessionId }
        : { tabId };
    this.jsDialogsByTabId.set(tabId, {
      id: this.nextJsDialogId(),
      message: event.params.message ?? "",
      promptText: event.params.defaultPrompt ?? "",
      target,
      type,
      url: event.params.url ?? "",
    });
  },
  async allowBeforeUnload(this: CdpDialogOwner, event: FrameEvent) {
    const tabId = this.attachedTabIdForCdpEvent(event.source);
    if (tabId == null) return;
    const target =
      typeof event.source.sessionId === "string"
        ? { tabId, sessionId: event.source.sessionId }
        : { tabId };
    await this.callTarget(target, "Page.handleJavaScriptDialog", {
      accept: true,
    }).catch(() => {});
  },
  deleteJsDialogForTarget(this: CdpDialogOwner, source: Partial<CdpTarget>) {
    const tabId = this.attachedTabIdForCdpEvent(source);
    if (tabId == null) return;
    const dialog = this.jsDialogsByTabId.get(tabId);
    if (dialog != null && matchesDialogTarget(dialog.target, source))
      this.jsDialogsByTabId.delete(tabId);
  },
  throwIfJsDialogBlocksMethod(
    this: CdpDialogOwner,
    tabId: number,
    method: string,
  ) {
    if (method === "Page.handleJavaScriptDialog") return;
    const dialog = this.jsDialogsByTabId.get(tabId);
    if (dialog != null)
      throw new Error(
        `A ${dialog.type} JavaScript dialog is active in this tab. Use \`tab.getJsDialog()\` to get it and dismiss it first.`,
      );
  },
  nextJsDialogId(this: CdpDialogOwner) {
    this.jsDialogSequence += 1;
    return String(this.jsDialogSequence);
  },
};

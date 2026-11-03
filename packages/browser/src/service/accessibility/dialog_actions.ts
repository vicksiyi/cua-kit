import { positiveTabId } from "../tab_id";
import type { CdpTarget } from "../cdp/dispatch_helpers";
import type { JsDialog } from "../cdp/dialog_methods";
/** Original Do, shared by AX preparation and dialog target errors. */
export class AccessibilityActionError extends Error {}
interface DialogContext {
  browserId: string;
  cdp: {
    activeJsDialog(tabId: number, id: string): JsDialog;
    updateJsDialogPrompt(tabId: number, id: string, text: string): unknown;
    callTarget(
      target: CdpTarget,
      method: string,
      params: object,
    ): Promise<unknown>;
    waitForEvent(
      tabId: number,
      predicate: (event: DialogEvent) => boolean,
      options: {
        signal: AbortSignal;
        timeoutMessage: string;
        timeoutMs: number;
      },
    ): Promise<unknown>;
    deleteJsDialog(tabId: number, id: string): unknown;
  };
  ax: {
    targetForElement(
      tabId: number,
      id: number,
    ): { javaScriptDialog?: { dialogID: string; control: string } };
  };
}
interface DialogEvent {
  method: string;
  source: Partial<CdpTarget>;
}
/** Original dre. */
export function isDialogClosed(event: DialogEvent, target: CdpTarget): boolean {
  return event.method !== "Page.javascriptDialogClosed"
    ? false
    : target.sessionId != null
      ? event.source.sessionId === target.sessionId
      : event.source.tabId === target.tabId && event.source.sessionId == null;
}
/** Original F2/lre. Closing event may arrive before the command promise settles. */
export async function closeJavaScriptDialog(
  context: DialogContext,
  tabId: number,
  id: string,
  target: CdpTarget,
  payload: object,
): Promise<void> {
  const controller = new AbortController();
  let settled = false;
  const dispatch = context.cdp
    .callTarget(target, "Page.handleJavaScriptDialog", payload)
    .then(
      (value) => {
        settled = true;
        return value;
      },
      (error) => {
        settled = true;
        throw error;
      },
    );
  const closed = context.cdp
    .waitForEvent(tabId, (event) => isDialogClosed(event, target), {
      signal: controller.signal,
      timeoutMessage: "Timed out waiting for JavaScript dialog to close.",
      timeoutMs: 60000,
    })
    .then(() => {});
  try {
    await Promise.race([closed, dispatch.then(async () => await closed)]);
    context.cdp.deleteJsDialog(tabId, id);
  } finally {
    controller.abort();
    if (!settled) dispatch.catch(() => {});
  }
}
/** Original cre. */
export function requirePromptText(value: unknown): string {
  if (typeof value !== "string")
    throw new Error("Prompt dialogs require prompt text");
  return value;
}
/** Original Mv. */
export async function handleJavaScriptDialog(
  payload: {
    tab_id: unknown;
    dialog_id: string;
    action: string;
    prompt_text?: unknown;
    browser_id?: string;
  },
  context: DialogContext,
): Promise<void> {
  const tabId = positiveTabId(payload.tab_id);
  const dialog = context.cdp.activeJsDialog(tabId, payload.dialog_id);
  if (payload.action === "accept") {
    if (dialog.type === "alert" || dialog.type === "beforeunload")
      throw new Error(`Dialog type ${dialog.type} does not support accept()`);
    if (dialog.type === "confirm" && payload.prompt_text != null)
      throw new Error("Confirm dialogs do not accept prompt text");
    const params =
      dialog.type === "prompt"
        ? { accept: true, promptText: requirePromptText(payload.prompt_text) }
        : { accept: true };
    await closeJavaScriptDialog(
      context,
      tabId,
      payload.dialog_id,
      dialog.target,
      params,
    );
    return;
  }
  if (payload.action === "dismiss") {
    await closeJavaScriptDialog(
      context,
      tabId,
      payload.dialog_id,
      dialog.target,
      { accept: dialog.type === "alert" },
    );
    return;
  }
  throw new Error(`Unsupported dialog action: ${String(payload.action)}`);
}
/** Original Cre: action fields are validated by the command schema before this boundary. */
export async function performDialogAction(
  context: DialogContext,
  tabId: number,
  action: any,
  dialogId: string,
): Promise<void> {
  const dialog = context.cdp.activeJsDialog(tabId, dialogId);
  if (
    (action.kind === "click" || action.kind === "press_key") &&
    ((action.duration ?? 0) > 0 ||
      (action.kind === "click" && action.key != null))
  )
    throw new Error("JavaScript dialog controls do not support held input");
  if (action.kind === "click" && Array.isArray(action.target))
    throw new Error(
      "JavaScript dialog controls have no viewport coordinates; use an accessibility element index with tab.ax.click(elementIndex)",
    );
  if (
    action.kind === "click" &&
    action.mouse_button != null &&
    action.mouse_button !== "left" &&
    action.mouse_button !== "l"
  )
    throw new Error("JavaScript dialog controls only support left clicks");
  const id =
    action.kind === "click" && typeof action.target === "number"
      ? action.target
      : ["set_value", "paste", "type_text", "press_key"].includes(action.kind)
        ? action.element_index
        : null;
  let target;
  try {
    target =
      id == null
        ? undefined
        : context.ax.targetForElement(tabId, id).javaScriptDialog;
  } catch (error) {
    throw new AccessibilityActionError(String(error), { cause: error });
  }
  if (id != null && target == null)
    throw new AccessibilityActionError(
      "A JavaScript dialog is blocking the requested page element",
    );
  if (target != null && target.dialogID !== dialog.id)
    throw new AccessibilityActionError("JavaScript dialog is no longer active");
  if (action.kind === "set_value" && target?.control === "prompt") {
    context.cdp.updateJsDialogPrompt(tabId, dialog.id, action.value);
    return;
  }
  if (
    action.kind === "type_text" &&
    dialog.type === "prompt" &&
    (target == null || target.control === "prompt")
  ) {
    context.cdp.updateJsDialogPrompt(
      tabId,
      dialog.id,
      dialog.promptText + action.text,
    );
    return;
  }
  let control = action.kind === "click" ? target?.control : undefined;
  if (action.kind === "press_key") {
    const key = action.key.toLowerCase();
    if (key === "return" || key === "enter")
      control = target?.control === "dismiss" ? "dismiss" : "accept";
    if (key === "escape" || key === "esc") control = "dismiss";
  }
  if (control !== "accept" && control !== "dismiss")
    throw new Error(
      "A JavaScript dialog is active; interact with its controls first",
    );
  const operation =
    control === "dismiss" || dialog.type === "alert" ? "dismiss" : "accept";
  await handleJavaScriptDialog(
    {
      action: operation,
      browser_id: context.browserId,
      dialog_id: dialog.id,
      prompt_text:
        dialog.type === "prompt" && operation === "accept"
          ? dialog.promptText
          : undefined,
      tab_id: String(tabId),
    },
    context,
  );
}

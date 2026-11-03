import { TabHandleJsDialog } from "./commands/tab_control";
import type { ClientTransport } from "./runtime/function_agent_transport";
export type JsDialogType = "alert" | "beforeunload" | "confirm" | "prompt";
export interface DialogOptions {
  browserId: string;
  dialogId: string;
  tabId: string;
  transport: ClientTransport;
}
/** Original vh. Field assignment semantics and operation order are preserved. */
export class JsDialog {
  declare browserId: string;
  declare dialogId: string;
  declare tabId: string;
  declare transport: ClientTransport;
  declare type: JsDialogType;
  constructor({
    browserId,
    dialogId,
    tabId,
    transport,
    type,
  }: DialogOptions & { type: JsDialogType }) {
    this.browserId = browserId;
    this.dialogId = dialogId;
    this.tabId = tabId;
    this.transport = transport;
    this.type = type;
  }
  async dismiss() {
    await this.transport.send({
      command: TabHandleJsDialog.create({
        action: "dismiss",
        browser_id: this.browserId,
        dialog_id: this.dialogId,
        tab_id: this.tabId,
      }),
    });
  }
}
/** Original xh; no accept method is added to alerts. */
export class AlertDialog extends JsDialog {
  constructor(options: DialogOptions) {
    super({ ...options, type: "alert" });
  }
}
/** Original kh. */
export class BeforeUnloadDialog extends JsDialog {
  constructor(options: DialogOptions) {
    super({ ...options, type: "beforeunload" });
  }
}
/** Original Sh. */
export class ConfirmDialog extends JsDialog {
  constructor(options: DialogOptions) {
    super({ ...options, type: "confirm" });
  }
  async accept() {
    await this.transport.send({
      command: TabHandleJsDialog.create({
        action: "accept",
        browser_id: this.browserId,
        dialog_id: this.dialogId,
        tab_id: this.tabId,
      }),
    });
  }
}
/** Original Th. */
export class PromptDialog extends JsDialog {
  constructor(options: DialogOptions) {
    super({ ...options, type: "prompt" });
  }
  async accept(text: string) {
    if (typeof text !== "string")
      throw new Error("prompt.accept requires text");
    await this.transport.send({
      command: TabHandleJsDialog.create({
        action: "accept",
        browser_id: this.browserId,
        dialog_id: this.dialogId,
        prompt_text: text,
        tab_id: this.tabId,
      }),
    });
  }
}

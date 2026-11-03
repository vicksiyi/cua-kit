export interface JavaScriptDialog {
  id: string;
  type: string;
  message: string;
}
interface DialogEvent {
  method: string;
  source: { tabId: number };
  params: { type?: string };
}
export interface DialogCdp {
  getJsDialog(tabId: number): Pick<JavaScriptDialog, "id" | "type"> | undefined;
  activeJsDialog(tabId: number, id: string): JavaScriptDialog;
  on(event: "event", listener: (event: DialogEvent) => void): unknown;
  removeListener(
    event: "event",
    listener: (event: DialogEvent) => void,
  ): unknown;
}
/** Original nu: subscribe before checking current dialog; remove listener on either race outcome. */
export async function raceJavaScriptDialog<T>(
  cdp: DialogCdp,
  tabId: number,
  operation: () => Promise<T>,
  onDialog: (dialog: JavaScriptDialog) => T | PromiseLike<T>,
): Promise<T> {
  let remove = () => {};
  const dialog = new Promise<JavaScriptDialog>((resolve) => {
    const listener = (event: DialogEvent) => {
      if (
        event.method !== "Page.javascriptDialogOpening" ||
        event.source.tabId !== tabId ||
        event.params.type === "beforeunload"
      )
        return;
      const current = cdp.getJsDialog(tabId);
      if (current != null) resolve(cdp.activeJsDialog(tabId, current.id));
    };
    cdp.on("event", listener);
    remove = () => {
      cdp.removeListener("event", listener);
    };
  });
  try {
    const current = cdp.getJsDialog(tabId);
    if (current != null && current.type !== "beforeunload")
      return await onDialog(cdp.activeJsDialog(tabId, current.id));
    const interrupted = dialog.then(onDialog);
    return await Promise.race([
      operation().catch((error) => {
        const current = cdp.getJsDialog(tabId);
        if (current != null && current.type !== "beforeunload")
          return interrupted;
        throw error;
      }),
      interrupted,
    ]);
  } finally {
    remove();
  }
}
interface Action {
  kind: string;
  [name: string]: unknown;
}
interface Context {
  cdp: DialogCdp;
}
/** Original Gh. Tre and Cre remain explicit dependencies until full action dispatch is restored. */
export function createAccessibilityActions<C extends Context>(
  performPageAction: (
    context: C,
    tabId: number,
    action: Action,
    signal: AbortSignal,
  ) => Promise<unknown>,
  performDialogAction: (
    context: C,
    tabId: number,
    action: Action,
    dialogId: string,
  ) => Promise<unknown>,
) {
  return class AccessibilityActions {
    context: C;
    pendingInput = new Map<number, Promise<void>>();
    constructor(context: C) {
      this.context = context;
    }
    async perform(tabId: number, action: Action): Promise<void> {
      const context = this.context;
      const dialog = context.cdp.getJsDialog(tabId);
      if (dialog != null) {
        await performDialogAction(context, tabId, action, dialog.id);
        return;
      }
      const controller = new AbortController();
      await raceJavaScriptDialog(
        context.cdp,
        tabId,
        () => {
          const pending = this.pendingInput.get(tabId);
          const operation = (async () => {
            await pending;
            controller.signal.throwIfAborted();
            await performPageAction(context, tabId, action, controller.signal);
          })();
          if (
            action.kind === "type_text" ||
            action.kind === "click" ||
            action.kind === "press_key"
          ) {
            const tracked = operation
              .catch(() => {})
              .finally(() => {
                if (this.pendingInput.get(tabId) === tracked)
                  this.pendingInput.delete(tabId);
              });
            this.pendingInput.set(tabId, tracked);
          }
          return operation;
        },
        (dialog) => {
          const message = /[.!?]$/.test(dialog.message)
            ? dialog.message
            : `${dialog.message}.`;
          const error = new Error(
            `Browser action "${action.kind}" interrupted by JavaScript ${dialog.type}: ${message} The action may already have taken effect; do not retry it. Inspect or dismiss the dialog before continuing.`,
          );
          controller.abort(error);
          throw error;
        },
      );
    }
  };
}

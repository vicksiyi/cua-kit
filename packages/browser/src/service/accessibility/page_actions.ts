import { clipboardOperations } from "../clipboard/operations";
import type { ClipboardContext } from "../clipboard/operations";
import {
  clickAccessibilityTarget,
  performSecondaryAction,
  setAccessibilityValue,
} from "./click_action";
import type { ClickContext } from "./click_action";
import { coordinateTarget, scrollAccessibilityTarget } from "./scroll_action";
import { prepareAccessibilityInput } from "./prepare_action";
import { dispatchAxText } from "../input/text_input";
import { clipboardKeys } from "../input/keyboard_dispatch";
import { clipboardShortcutError } from "../input/keyboard_keys";
import { keyboardDispatch } from "../input/index";
import { callElementFunction } from "./element_execution";
import { selectElementText } from "./selection";
import type { DialogCdp } from "./action_coordinator";
import { createAccessibilityActions } from "./action_coordinator";
import { performDialogAction } from "./dialog_actions";
export type PageActionContext = ClipboardContext & {
  cdp: DialogCdp;
} & ClickContext &
  Parameters<typeof prepareAccessibilityInput>[0] &
  Parameters<typeof scrollAccessibilityTarget>[0] &
  Parameters<typeof performDialogAction>[0] & {
    cua: ClickContext["cua"] & {
      dragPath(request: {
        modifiers: number;
        path: { x: number; y: number }[];
        tabId: number;
      }): Promise<unknown>;
    };
  };
interface ClipboardRequest {
  commandType: "tab_ax_action";
  ctx: PageActionContext;
  tabId: number;
  focusTarget: (
    requireEditable: boolean,
  ) => ReturnType<typeof prepareAccessibilityInput>;
}
export interface AxClipboardOperations {
  run(
    request: ClipboardRequest & {
      action: "paste";
      items: { entries: { mime_type: string; text: string }[] }[];
    },
  ): Promise<unknown>;
  keypress(request: ClipboardRequest & { keypress: string }): Promise<boolean>;
}
/** Original Tre, assembled with reconstructed Zy/oo clipboard operations by default. */
export function createPageActionDispatcher(
  clipboard: AxClipboardOperations = clipboardOperations,
) {
  return async function performPageAction(
    context: PageActionContext,
    tabId: number,
    action: any,
    signal: AbortSignal,
  ): Promise<void> {
    switch (action.kind) {
      case "click":
        await clickAccessibilityTarget(context, tabId, action.target, {
          button: action.mouse_button,
          clickCount: action.click_count ?? 1,
          key: action.key,
          durationMs: (action.duration ?? 0) * 1000,
          signal,
        });
        return;
      case "drag": {
        const from = (await coordinateTarget(context, tabId, action.from))
            .point,
          to = (await coordinateTarget(context, tabId, action.to)).point;
        const path = [
          from,
          ...Array.from({ length: 8 }, (_, index) => ({
            x: from.x + ((to.x - from.x) * (index + 1)) / 8,
            y: from.y + ((to.y - from.y) * (index + 1)) / 8,
          })),
        ];
        await context.cua.dragPath({ modifiers: 0, path, tabId });
        return;
      }
      case "perform_secondary_action":
        await performSecondaryAction(context, tabId, action);
        return;
      case "type_text": {
        const target = await prepareAccessibilityInput(
          context,
          tabId,
          action.element_index,
          { requireEditable: true, signal },
        );
        await dispatchAxText(context.cdp, target, action.text, signal);
        return;
      }
      case "paste": {
        const entries = [{ mime_type: "text/plain", text: action.text }];
        if (action.format === "html")
          entries.unshift({ mime_type: "text/html", text: action.text });
        await clipboard.run({
          action: "paste",
          commandType: "tab_ax_action",
          ctx: context,
          focusTarget: () =>
            prepareAccessibilityInput(context, tabId, action.element_index, {
              requireEditable: true,
              signal,
            }),
          items: [{ entries }],
          tabId,
        });
        return;
      }
      case "press_key": {
        const focusTarget = (requireEditable: boolean) =>
          prepareAccessibilityInput(context, tabId, action.element_index, {
            requireEditable,
            signal,
          });
        if (
          (action.duration ?? 0) > 0 &&
          clipboardKeys(action.key, context.cdp.platform) != null
        )
          throw new Error(clipboardShortcutError);
        if (
          !(await clipboard.keypress({
            commandType: "tab_ax_action",
            ctx: context,
            focusTarget,
            keypress: action.key,
            tabId,
          }))
        ) {
          const target = await focusTarget(false);
          await keyboardDispatch.dispatchKeys(
            context.cdp,
            target.target,
            action.key,
            { ...target, durationMs: (action.duration ?? 0) * 1000, signal },
          );
        }
        return;
      }
      case "scroll":
        await scrollAccessibilityTarget(context, tabId, action);
        return;
      case "select_text":
        await callElementFunction(
          context,
          context.ax.targetForElement(tabId, action.element_index),
          selectElementText,
          {
            prefix: action.prefix,
            selectionType: action.selection_type ?? "text",
            suffix: action.suffix,
            text: action.text,
          },
        );
        return;
      case "set_value":
        await setAccessibilityValue(
          context,
          tabId,
          action.element_index,
          action.value,
        );
        return;
      default:
        throw new Error(`Unsupported accessibility action: ${action}`);
    }
  };
}
/** Gh + Tre + Cre assembly, including reconstructed clipboard operations. */
export function createAxActionService(
  clipboard: AxClipboardOperations = clipboardOperations,
) {
  return createAccessibilityActions(
    createPageActionDispatcher(clipboard),
    performDialogAction,
  );
}

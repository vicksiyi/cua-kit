import {
  captureWorkspaceSelection,
  googleWorkspaceDocument,
} from "./google_workspace";
import { observeSidePanelSelection } from "./side_panel_selection";
/** Original sidepanel pe. Pin recovery/reconciliation to the first observed
 * document and recheck the caller generation after each asynchronous boundary. */
export function createSidePanelSelectionCapture(
  browser: Pick<typeof chrome, "scripting">,
) {
  return async (
    tabId: number,
    url: string,
    observerId: string,
    isCurrent = () => true,
  ) => {
    if (!isCurrent()) return;
    const doc = googleWorkspaceDocument(url);
    const mode =
      doc == null
        ? "none"
        : doc.docType === "spreadsheets"
          ? "event"
          : "polling";
    const [initial] = await browser.scripting.executeScript({
      args: [url, observerId, mode],
      func: observeSidePanelSelection,
      target: { tabId },
    });
    if (!isCurrent()) return;
    if (!initial?.result?.needsRecovery || initial.documentId == null)
      return initial;
    const target = { tabId, documentIds: [initial.documentId] };
    const [recovered] = await browser.scripting.executeScript({
      args: [new URL(url).origin, url, 80000],
      func: captureWorkspaceSelection,
      target,
      world: "MAIN",
    });
    if (!isCurrent()) return;
    const selectedText = recovered?.result?.selectedText;
    const [result] = await browser.scripting.executeScript({
      args: [
        url,
        observerId,
        mode,
        {
          captureGeneration: initial.result.captureGeneration,
          selectedText:
            typeof selectedText === "string" && selectedText.trim().length > 0
              ? selectedText
              : null,
        },
      ],
      func: observeSidePanelSelection,
      target,
    });
    return result;
  };
}

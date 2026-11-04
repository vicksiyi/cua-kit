import {
  googleWorkspaceDocument,
  exportFileStem,
} from "@core/browser/tabReading";
// Original chunk i/d share the browser service's identical parsing/name logic.
export { googleWorkspaceDocument, exportFileStem };
export function googleWorkspaceExportFormats(
  type: "document" | "presentation" | "spreadsheets",
) {
  switch (type) {
    case "document":
      return ["md", "pdf"];
    case "presentation":
      return ["pdf"];
    case "spreadsheets":
      return ["xlsx", "pdf"];
  }
}
export function googleWorkspaceExportUrl(
  doc: NonNullable<ReturnType<typeof googleWorkspaceDocument>>,
  format: string,
) {
  const url = new URL(
    `https://docs.google.com/${doc.docType}/d/${doc.docId}/export`,
  );
  url.searchParams.set("format", format);
  const tab = doc.url.searchParams.get("tab");
  if (tab != null) url.searchParams.append("tab", tab);
  url.hash = doc.url.hash;
  return url.toString();
}
export function stripWorkspaceInlineDataReferences(text: string) {
  return text.replace(/^\s*\[[^\]]+\]:\s*<data:[^>]+>\s*\n?/gm, "").trim();
}
/** Original m. Serialized MAIN-world copy-event capture; never reads or writes
 * the system clipboard. The page's own copy handler fills the event DataTransfer. */
export function captureWorkspaceSelection(
  expectedOrigin: string,
  expectedUrl: string | null,
  maxLength: number,
) {
  if (
    location.origin !== expectedOrigin ||
    (expectedUrl != null && location.href !== expectedUrl)
  )
    return { selectedText: null };
  const active = document.activeElement;
  let childDocument: Document | null = null;
  if (active instanceof HTMLIFrameElement)
    try {
      childDocument = active.contentDocument;
    } catch {}
  const target = childDocument?.activeElement ?? active ?? document.body;
  const view = (target.ownerDocument.defaultView ?? window) as Window &
    typeof globalThis;
  if (
    typeof view.DataTransfer !== "function" ||
    typeof view.ClipboardEvent !== "function"
  )
    return { selectedText: null };
  const data = new view.DataTransfer();
  const event = new view.ClipboardEvent("copy", {
    bubbles: true,
    cancelable: true,
    clipboardData: data,
    composed: true,
  });
  target.dispatchEvent(event);
  return {
    selectedText: data.getData("text/plain").slice(0, maxLength) || null,
  };
}

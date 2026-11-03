import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
import {
  googleWorkspaceDocument,
  exportFileStem,
} from "../context/tab_context";
const commandType = "tab_content_export_gsuite";
export const workspaceExportFormats = {
  document: new Set(["pdf", "md", "docx"]),
  spreadsheets: new Set(["pdf", "xlsx", "csv"]),
  presentation: new Set(["pdf", "pptx"]),
};
const allFormats = new Set(["pdf", "md", "xlsx", "csv", "docx", "pptx"]);
interface ExportFilesystem {
  tmpDir: string;
  mkdir(path: string, options: { recursive: boolean }): Promise<unknown>;
  writeFile(path: string, data: Uint8Array): Promise<unknown>;
}
interface WorkspaceExportContext {
  acquireAuthority(): {
    observeContent(url: unknown): { assert(): Promise<unknown> };
  };
  security: { currentTabUrl(tabId: number): Promise<unknown> };
  tabs: {
    get(tabId: number): Promise<{ url?: string | null; title?: string | null }>;
  };
  cdp: {
    evaluateJavascript(
      tabId: number,
      expression: string,
      options: { awaitPromise: boolean },
    ): Promise<any>;
  };
  filesystem: ExportFilesystem;
}
/** Original Jv: preserve tab query and document fragment, discard other query fields. */
export function workspaceExportUrl(
  document: NonNullable<ReturnType<typeof googleWorkspaceDocument>>,
  format: string,
) {
  const url = new URL(
    `https://docs.google.com/${document.docType}/d/${document.docId}/export`,
  );
  url.searchParams.set("format", format);
  const tab = document.url.searchParams.get("tab");
  if (tab != null) url.searchParams.append("tab", tab);
  url.hash = document.url.hash;
  return url.toString();
}
/** Original Qh, removes only data-URL reference definitions. */
export function cleanExportMarkdown(text: string) {
  return text.replace(/^\s*\[[^\]]+\]:\s*<data:[^>]+>\s*\n?/gm, "").trim();
}
/** Original dne. Self-contained page-world fetch and chunked binary/base64 conversion. */
export async function fetchWorkspaceExport({
  exportUrl,
}: {
  exportUrl: string;
}) {
  const response = await fetch(exportUrl, { method: "GET" });
  if (!response.ok)
    throw new Error(
      "GSuite export request failed with HTTP " + response.status,
    );
  const bytes = new Uint8Array(await response.arrayBuffer()),
    chunkSize = 32768;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return { base64: btoa(binary) };
}
/** Original pne/mne. */
export function workspaceExportExpression(request: { exportUrl: string }) {
  return `(${fetchWorkspaceExport.toString()})(${JSON.stringify(request)})`;
}
export async function readWorkspaceExport(request: {
  tabId: number;
  exportUrl: string;
  cdp: WorkspaceExportContext["cdp"];
}) {
  const result = await request.cdp.evaluateJavascript(
    request.tabId,
    workspaceExportExpression({ exportUrl: request.exportUrl }),
    { awaitPromise: true },
  );
  if (result?.base64 == null)
    throw new Error("Unable to export GSuite content for this tab");
  return result;
}
/** Original fne/hne/gne. */
export function workspaceExportFormat(value: unknown) {
  if (typeof value !== "string" || !allFormats.has(value))
    throw new Error(`${commandType} requires supported format`);
  return value;
}
export function workspaceExportBytes(
  result: { base64: string },
  format: string,
) {
  const bytes = Uint8Array.from(atob(result.base64), (char) =>
    char.charCodeAt(0),
  );
  return format === "md"
    ? new TextEncoder().encode(
        cleanExportMarkdown(new TextDecoder().decode(bytes)),
      )
    : bytes;
}
export async function workspaceExportPath(
  title: string | null | undefined,
  format: string,
  filesystem: ExportFilesystem,
) {
  const directory = `${filesystem.tmpDir}/browser-use/exports`;
  await filesystem.mkdir(directory, { recursive: true });
  return `${directory}/${exportFileStem(title)}-${crypto.randomUUID()}.${format}`;
}
/** Original lF, preserving mkdir-before-decode and write-only error wrapping. */
export const TabContentExportGSuiteCommand = defineCommand(
  commandType,
  async (
    payload: { tab_id: unknown; format: unknown },
    context: WorkspaceExportContext,
  ) => {
    const tabId = positiveTabId(payload.tab_id);
    await context
      .acquireAuthority()
      .observeContent(await context.security.currentTabUrl(tabId))
      .assert();
    const format = workspaceExportFormat(payload.format),
      tab = await context.tabs.get(tabId),
      document = googleWorkspaceDocument(tab.url);
    if (document == null)
      throw new Error("Tab is not a Google Workspace document");
    if (
      !workspaceExportFormats[
        document.docType as keyof typeof workspaceExportFormats
      ].has(format)
    )
      throw new Error("GSuite export type is not supported for this tab");
    const result = await readWorkspaceExport({
      exportUrl: workspaceExportUrl(document, format),
      tabId,
      cdp: context.cdp,
    });
    const path = await workspaceExportPath(
        tab.title,
        format,
        context.filesystem,
      ),
      bytes = workspaceExportBytes(result, format);
    if (bytes.length === 0)
      throw new Error("Unable to export GSuite content for this tab");
    try {
      await context.filesystem.writeFile(path, bytes);
    } catch (error) {
      throw new Error("Unable to write exported content to disk", {
        cause: error,
      });
    }
    return { path };
  },
);

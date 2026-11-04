import {
  googleWorkspaceDocument,
  youtubeVideoId,
  readYoutubeTranscript,
} from "@core/browser/tabReading";
import { captureTabPage } from "./tab_capture";
export interface TabReadRequest {
  kind: string;
  format?: string;
}
export type TabReadExecutor = (
  func: (...args: any[]) => any,
  args: any[],
  world: "ISOLATED" | "MAIN",
) => Promise<unknown>;
const exportTooLarge =
  "Google Workspace export is too large for in-memory tab context";
const changedTab = "The selected tab changed while being read";
/** Original fg; self-contained isolated-world selection reader. */
export function captureTabSelection(expectedUrl: string, maxLength: number) {
  if (location.href !== expectedUrl) return null;
  const text = globalThis.getSelection()?.toString().trim() ?? "";
  return text.length === 0
    ? null
    : { text: text.slice(0, maxLength), truncated: text.length > maxLength };
}
/** Original sg/ag. */
export function workspaceExportFormats(type: string) {
  switch (type) {
    case "document":
      return ["md", "pdf"];
    case "presentation":
      return ["pdf"];
    case "spreadsheets":
      return ["xlsx", "pdf"];
  }
}
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
/** Original og; this function is serialized into the page and must not capture module bindings. */
export async function captureWorkspaceExport(
  origin: string,
  exportUrl: string,
  maxBytes: number,
  tooLargeMessage: string,
  allowTruncate: boolean,
) {
  if (location.origin !== origin)
    return { errorMessage: "The tab origin changed before export." };
  const response = await fetch(exportUrl, { method: "GET" });
  if (!response.ok)
    throw new Error(
      `GSuite export request failed with HTTP ${response.status}`,
    );
  try {
    if (new URL(response.url).origin !== new URL(exportUrl).origin) {
      await response.body?.cancel().catch(() => {});
      return { redirectUrl: response.url };
    }
  } catch {
    return { errorMessage: "The export returned an invalid URL." };
  }
  const declared = Number(response.headers.get("content-length") ?? NaN);
  const oversized = Number.isFinite(declared) && declared > maxBytes;
  if (oversized && !allowTruncate) {
    await response.body?.cancel().catch(() => {});
    return { errorMessage: tooLargeMessage };
  }
  function base64(bytes: Uint8Array) {
    let text = "";
    for (let offset = 0; offset < bytes.length; offset += 32768)
      text += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return btoa(text);
  }
  function completeUtf8Length(bytes: Uint8Array) {
    if (bytes.length === 0) return 0;
    let continuation = 0;
    while (continuation < bytes.length) {
      const byte = bytes[bytes.length - continuation - 1];
      if (byte == null || byte < 128 || byte > 191) break;
      continuation++;
    }
    const start = bytes.length - continuation - 1;
    if (start < 0) return 0;
    const lead = bytes[start];
    if (lead == null) return start;
    let size: number;
    if (lead < 128) size = 1;
    else if (lead >= 194 && lead <= 223) size = 2;
    else if (lead >= 224 && lead <= 239) size = 3;
    else if (lead >= 240 && lead <= 244) size = 4;
    else return start;
    return size === 1 || continuation === size - 1 ? bytes.length : start;
  }
  const reader = response.body?.getReader();
  if (reader == null) {
    if (oversized) return { errorMessage: tooLargeMessage };
    const blob = await response.blob();
    if (blob.size > maxBytes) {
      if (!allowTruncate) return { errorMessage: tooLargeMessage };
      const bytes = new Uint8Array(await blob.slice(0, maxBytes).arrayBuffer());
      return {
        base64: base64(bytes.subarray(0, completeUtf8Length(bytes))),
        truncated: true,
      };
    }
    return { base64: base64(new Uint8Array(await blob.arrayBuffer())) };
  }
  const chunks: Uint8Array[] = [];
  let length = 0,
    truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value != null) {
      if (length + value.byteLength > maxBytes) {
        if (!allowTruncate) {
          await reader.cancel();
          return { errorMessage: tooLargeMessage };
        }
        const remaining = maxBytes - length;
        if (remaining > 0) {
          const piece = value.subarray(0, remaining);
          chunks.push(new Uint8Array(piece));
          length += piece.byteLength;
        }
        await reader.cancel();
        truncated = true;
        break;
      }
      length += value.byteLength;
      chunks.push(new Uint8Array(value));
    }
  }
  let bytes = new Uint8Array(length),
    offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (truncated) bytes = bytes.subarray(0, completeUtf8Length(bytes));
  return { base64: base64(bytes), truncated };
}
/** Original hg: preserve execution-world choices and branch-specific validation. */
export async function dispatchTabRead(
  expectedUrl: string,
  read: TabReadRequest,
  execute: TabReadExecutor,
) {
  switch (read.kind) {
    case "page":
      return await execute(
        captureTabPage,
        [expectedUrl, null, null],
        "ISOLATED",
      );
    case "selection":
      return await execute(
        captureTabSelection,
        [expectedUrl, 80000],
        "ISOLATED",
      );
    case "googleWorkspaceExport": {
      const document = googleWorkspaceDocument(expectedUrl);
      if (
        document == null ||
        !workspaceExportFormats(document.docType)!.includes(read.format!)
      )
        throw new Error("Unsupported Google Workspace export");
      return await execute(
        captureWorkspaceExport,
        [
          document.url.origin,
          workspaceExportUrl(document, read.format!),
          32 * 1024 * 1024,
          exportTooLarge,
          read.format === "md",
        ],
        "ISOLATED",
      );
    }
    case "youtubeTranscript": {
      const video = youtubeVideoId(expectedUrl);
      if (video == null) throw new Error("Unsupported YouTube page");
      return await readYoutubeTranscript(
        video,
        async (func, id, limits) => await execute(func, [id, limits], "MAIN"),
      );
    }
    default:
      throw new Error("Unsupported tab read");
  }
}
/** Original my: validate both before and after the read, including incognito and URL changes. */
export function createTabReader(
  chrome: Pick<typeof globalThis.chrome, "tabs" | "scripting">,
) {
  return async ({
    expectedUrl,
    read,
    tabId,
  }: {
    expectedUrl: string;
    read: TabReadRequest;
    tabId: number;
  }) => {
    const url = new URL(expectedUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:")
      throw new Error("Tab reads require an HTTP or HTTPS URL");
    const before = await chrome.tabs.get(tabId);
    if (before.incognito === true || before.url !== expectedUrl)
      throw new Error(changedTab);
    const result = await dispatchTabRead(
      expectedUrl,
      read,
      async (func, args, world) => {
        const [result] = await chrome.scripting.executeScript({
          args,
          func,
          target: { tabId },
          world,
        });
        return result?.result;
      },
    );
    const after = await chrome.tabs.get(tabId);
    if (after.incognito === true || after.url !== expectedUrl)
      throw new Error(changedTab);
    return result ?? null;
  };
}

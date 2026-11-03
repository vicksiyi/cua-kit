export type TabReader = (request: {
  kind: string;
  format?: string;
}) => Promise<any>;
export function googleWorkspaceDocument(input: string | null | undefined) {
  if (input == null) return null;
  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.host !== "docs.google.com") return null;
  const parts = url.pathname.split("/").filter(Boolean),
    docType = parts[0];
  if (
    docType !== "document" &&
    docType !== "presentation" &&
    docType !== "spreadsheets"
  )
    return null;
  const index = parts.indexOf("d", 1),
    docId = index < 0 ? null : parts[index + 1];
  return docId == null || docId.length === 0 || parts.at(-1) === "pub"
    ? null
    : { docId, docType, url };
}
export function exportFileStem(
  title: string | null | undefined,
  fallback = "ExportedContent",
) {
  const parts = (title ?? "Asset").split(" - ");
  const name = (
    parts.length > 1 && parts.at(-1)?.startsWith("Google")
      ? parts.slice(0, -1).join(" - ")
      : parts.join(" - ")
  )
    .replaceAll(/[/\\?%*|"<>:]/g, "_")
    .trim();
  return name.length === 0 ? fallback : name;
}
export function youtubeVideoId(input: string | null | undefined) {
  if (input == null) return null;
  try {
    const url = new URL(input);
    if (
      url.protocol !== "https:" ||
      (url.hostname !== "www.youtube.com" && url.hostname !== "youtube.com") ||
      url.pathname !== "/watch"
    )
      return null;
    const id = url.searchParams.get("v");
    return id != null && /^[A-Za-z0-9_-]{11}$/u.test(id) ? id : null;
  } catch {
    return null;
  }
}
function exportResult(
  value: any,
):
  | { errorMessage: string }
  | { redirectUrl: string }
  | { base64: string; truncated: boolean } {
  if (value == null || typeof value !== "object")
    return { errorMessage: "Unable to export content" };
  const errorMessage = Reflect.get(value, "errorMessage");
  if (typeof errorMessage === "string") return { errorMessage };
  const redirectUrl = Reflect.get(value, "redirectUrl");
  if (typeof redirectUrl === "string") return { redirectUrl };
  const base64 = Reflect.get(value, "base64");
  return typeof base64 !== "string" || base64.length === 0
    ? { errorMessage: "Unable to export content" }
    : { base64, truncated: Reflect.get(value, "truncated") === true };
}
export async function readWorkspaceContext({
  expectedUrl,
  read,
  title,
}: {
  expectedUrl: string;
  read: TabReader;
  title: string;
}): Promise<any> {
  const doc = googleWorkspaceDocument(expectedUrl);
  if (doc == null) return null;
  const formats =
    doc.docType === "document"
      ? ["md", "pdf"]
      : doc.docType === "presentation"
        ? ["pdf"]
        : ["xlsx", "pdf"];
  for (const format of formats) {
    let result;
    try {
      result = exportResult(
        await read({ kind: "googleWorkspaceExport", format }),
      );
    } catch (error) {
      if (
        (error instanceof Error ? error.message : error) ===
        "The selected tab changed while being read"
      )
        throw error;
      continue;
    }
    if ("errorMessage" in result) {
      if (
        result.errorMessage ===
        "Google Workspace export is too large for in-memory tab context"
      )
        throw new Error(result.errorMessage);
      continue;
    }
    if (!("redirectUrl" in result))
      return format === "md"
        ? {
            kind: "text",
            text: new TextDecoder()
              .decode(
                Uint8Array.from(atob(result.base64), (char) =>
                  char.charCodeAt(0),
                ),
              )
              .replace(/^\s*\[[^\]]+\]:\s*<data:[^>]+>\s*\n?/gm, "")
              .trim(),
            truncated: result.truncated === true,
          }
        : {
            dataBase64: result.base64,
            fileName: `${exportFileStem(title)}.${format}`,
            kind: "document",
            mimeType:
              format === "pdf"
                ? "application/pdf"
                : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          };
  }
  return null;
}
function validatePage(page: any, expectedUrl: string) {
  if (
    page == null ||
    typeof page !== "object" ||
    !("url" in page) ||
    page.url !== expectedUrl ||
    !("title" in page) ||
    typeof page.title !== "string" ||
    page.title.length > 4096 ||
    !("text" in page) ||
    typeof page.text !== "string" ||
    !("truncated" in page) ||
    typeof page.truncated !== "boolean"
  )
    throw new Error("Unable to read tab context for the authorized page");
  return {
    text: page.text,
    title: page.title,
    truncated: page.truncated,
    url: expectedUrl,
  };
}
async function readSelection(read: TabReader) {
  try {
    const selection = await read({ kind: "selection" });
    if (selection == null || typeof selection !== "object") return null;
    const text = Reflect.get(selection, "text"),
      truncated = Reflect.get(selection, "truncated");
    return typeof text === "string" && typeof truncated === "boolean"
      ? { text, truncated }
      : null;
  } catch {
    return null;
  }
}
export async function readTabContext({
  expectedUrl,
  read,
}: {
  expectedUrl: string;
  read: TabReader;
}): Promise<any> {
  const page = validatePage(await read({ kind: "page" }), expectedUrl);
  const workspace = await readWorkspaceContext({
    expectedUrl: page.url,
    read,
    title: page.title,
  });
  if (workspace?.kind === "text")
    return {
      kind: "text",
      text: workspace.text,
      title: page.title,
      truncated: workspace.truncated,
      url: page.url,
    };
  if (workspace?.kind === "document")
    return { ...workspace, title: page.title, url: page.url };
  const video = youtubeVideoId(page.url);
  const selection =
    video == null
      ? null
      : await readSelection(read).then((value) =>
          value?.text.trim() === page.text.trim() ? null : value,
        );
  if (video != null && selection == null)
    try {
      const transcript = await read({ kind: "youtubeTranscript" });
      if (
        transcript != null &&
        typeof transcript === "object" &&
        "pageUrl" in transcript &&
        typeof transcript.pageUrl === "string" &&
        "text" in transcript &&
        typeof transcript.text === "string" &&
        "truncated" in transcript &&
        typeof transcript.truncated === "boolean" &&
        transcript.pageUrl === expectedUrl
      )
        return {
          kind: "text",
          text: [
            page.text,
            "",
            "<browser__youtube_transcript>",
            transcript.text,
            "</browser__youtube_transcript>",
          ].join("\n"),
          title: page.title,
          truncated: page.truncated || transcript.truncated,
          url: page.url,
        };
    } catch {}
  return selection != null
    ? {
        kind: "text",
        text: [
          "<user__selection>",
          selection.text,
          "</user__selection>",
          "",
          "<browser__document__content>",
          page.text,
          "</browser__document__content>",
        ].join("\n"),
        title: page.title,
        truncated: page.truncated || selection.truncated,
        url: page.url,
      }
    : { kind: "text", ...page };
}

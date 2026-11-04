import type { createChatApiClass } from "./chat_api";
import {
  deleteKernelLibraryFile,
  type KernelLibraryFile,
} from "./kernel_tunnel_runtime";
type Api = Pick<
  InstanceType<ReturnType<typeof createChatApiClass>>,
  "request" | "signal"
>;
const blobHosts = [
  ".blob.core.windows.net",
  ".oaiusercontent.com",
  ".s3.ap-northeast-1.amazonaws.com",
  ".s3.ap-northeast-2.amazonaws.com",
  ".s3.ap-south-1.amazonaws.com",
  ".s3.ap-southeast-1.amazonaws.com",
  ".s3.ap-southeast-2.amazonaws.com",
  ".s3.ca-central-1.amazonaws.com",
  ".s3.eu-central-1.amazonaws.com",
  ".s3.eu-south-2.amazonaws.com",
  ".s3.eu-west-1.amazonaws.com",
  ".s3.eu-west-2.amazonaws.com",
  ".s3.us-east-1.amazonaws.com",
  ".s3.us-east-2.amazonaws.com",
  ".s3.us-west-1.amazonaws.com",
];
function record(value: unknown): value is Record<string, any> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
/** Original sl: require a readable, persistent Library file with the requested ID. */
export async function readUploadedLibraryFile(
  api: Pick<Api, "request">,
  id: string,
  signal?: AbortSignal,
): Promise<KernelLibraryFile> {
  const file = await api.request(`/files/${encodeURIComponent(id)}/simple`, {
    signal,
  });
  if (
    !record(file) ||
    file.file_id !== id ||
    file.is_library_file !== true ||
    typeof file.library_file_id !== "string" ||
    !file.library_file_id
  )
    throw new Error("The PDF upload did not create a readable Library file");
  return { fileId: id, libraryFileId: file.library_file_id };
}
/** Original ng: bounded newline-delimited processing status, always cancel reader. */
export async function readLibraryProcessingStatus(response: Response) {
  if (response.body == null)
    throw new Error("Library upload processing returned no status");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    bytes = 0,
    completed = false;
  const accept = (line: string) => {
    if (!line.trim()) return;
    const value: unknown = JSON.parse(line);
    if (!record(value) || typeof value.event !== "string")
      throw new Error("Invalid Library upload processing status");
    const extra = record(value.extra) ? value.extra : undefined;
    if (/(?:^|\.)(error|cancelled|failed|unknown)$/.test(value.event))
      throw new Error("Library upload processing failed");
    if (extra?.library_persistence_result === "temporary")
      throw new Error("Library storage is unavailable for this PDF upload");
    if (
      value.event === "file.processing.completed" ||
      value.event === "file.indexing.completed" ||
      (value.event === "file.indexing.started" &&
        extra?.retrieval_indexing_deferred === true)
    )
      completed = true;
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) {
        bytes += value.byteLength;
        if (bytes > 1048576)
          throw new Error("Library upload returned too much status data");
        buffer += decoder.decode(value, { stream: true });
      }
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        accept(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
      if (done) break;
    }
    accept(buffer + decoder.decode());
    if (!completed)
      throw new Error("Library upload processing did not complete");
  } finally {
    await reader.cancel();
  }
}
/** Original rg: account-authenticated create/process, destination-restricted bytes,
 * and best-effort Library cleanup after a created upload fails. */
export async function uploadLibraryPdf(
  api: Api,
  file: File,
  callerSignal: AbortSignal,
  fetchBytes: typeof fetch = fetch,
) {
  const signal = AbortSignal.any([
    callerSignal,
    api.signal,
    AbortSignal.timeout(180000),
  ]);
  const metadata = {
    file_name: file.name,
    mime_type: file.type,
    use_case: "my_files",
    upload_source: "browser_tab_context",
    entry_surface: "extension_handoff",
    library_persistence_mode: "required",
  };
  const created = await api.request("/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...metadata,
      file_size: file.size,
      store_in_library: true,
      supports_direct_azure_multipart: false,
    }),
    signal,
  });
  if (
    !record(created) ||
    created.status !== "success" ||
    typeof created.file_id !== "string" ||
    !created.file_id ||
    typeof created.upload_url !== "string"
  )
    throw new Error("Unable to create the PDF upload in Library");
  const id = created.file_id;
  try {
    const url = new URL(created.upload_url, "https://chatgpt.com");
    if (
      url.protocol !== "https:" ||
      url.port ||
      url.username ||
      url.password ||
      url.hash
    )
      throw new Error("Invalid Library upload destination");
    const estuary =
      /^\/(?:backend-)?api\/estuary\/upload_content_bytes\/?$/.test(
        url.pathname,
      );
    if (estuary && url.origin === "https://chatgpt.com") {
      const form = new FormData();
      form.append("file", file);
      form.append("upload_url", url.searchParams.get("upload_url") ?? url.href);
      await api.request(
        `/estuary/upload_content_bytes${url.search}`,
        { method: "POST", body: form, signal },
        {
          timeoutMs: 180000,
          readResponse: async (response) => {
            await response.body?.cancel();
          },
        },
      );
    } else {
      if (estuary || !blobHosts.some((suffix) => url.hostname.endsWith(suffix)))
        throw new Error("Unsupported Library upload destination");
      const headers = new Headers({ "Content-Type": file.type });
      if (
        ![...url.searchParams.keys()].some(
          (key) => key.toLowerCase() === "x-amz-algorithm",
        )
      ) {
        headers.set("x-ms-blob-type", "BlockBlob");
        headers.set("x-ms-version", "2020-04-08");
      }
      if (created.upload_headers != null) {
        if (!record(created.upload_headers))
          throw new Error("Invalid Library upload headers");
        for (const [name, value] of Object.entries(created.upload_headers)) {
          if (typeof value !== "string")
            throw new Error("Invalid Library upload headers");
          if (
            ["authorization", "cookie", "chatgpt-account-id"].includes(
              name.toLowerCase(),
            )
          )
            throw new Error(
              "Library blob uploads cannot forward account credentials",
            );
          headers.set(name, value);
        }
      }
      const uploaded = await fetchBytes(url, {
        method: "PUT",
        body: file,
        headers,
        credentials: "omit",
        redirect: "error",
        signal,
      });
      await uploaded.body?.cancel();
      if (!uploaded.ok)
        throw new Error(`Library byte upload failed (HTTP ${uploaded.status})`);
    }
    signal.throwIfAborted();
    await api.request(
      "/files/process_upload_stream",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_id: id,
          ...metadata,
          index_for_retrieval: true,
          metadata: { store_in_library: true },
        }),
        signal,
      },
      { timeoutMs: 120000, readResponse: readLibraryProcessingStatus },
    );
    const result = await readUploadedLibraryFile(api, id, signal);
    signal.throwIfAborted();
    return result;
  } catch (error) {
    await readUploadedLibraryFile(api, id)
      .then((file) => deleteKernelLibraryFile(api, file))
      .catch(() => {});
    throw error;
  }
}

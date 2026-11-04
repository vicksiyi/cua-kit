/** Original pS/mS/gS/_S: bounded extension favicon fetch and data URL encoding. */
const maxFaviconBytes = 64 * 1024;
async function readFaviconBytes(
  response: Response,
): Promise<Uint8Array | null> {
  const header = response.headers.get("content-length");
  const declared = header == null ? null : Number(header);
  if (
    declared != null &&
    Number.isFinite(declared) &&
    declared > maxFaviconBytes
  ) {
    await response.body?.cancel();
    return null;
  }
  if (response.body == null) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length <= maxFaviconBytes ? bytes : null;
  }
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value == null || value.length === 0) continue;
    total += value.length;
    if (total > maxFaviconBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}
export function createFaviconResourceReader(host: {
  chrome: Pick<typeof chrome, "runtime">;
  fetch: typeof globalThis.fetch;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
}) {
  async function readImage(
    url: string,
    fallbackType?: string,
  ): Promise<string | null> {
    const controller = new AbortController();
    const timer = host.setTimeout(() => controller.abort(), 2000);
    try {
      const response = await host.fetch(url, {
        credentials: "omit",
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const type = response.headers.get("content-type") ?? fallbackType;
      if (type == null || !type.startsWith("image/")) return null;
      const bytes = await readFaviconBytes(response);
      return bytes == null || bytes.length === 0
        ? null
        : `data:${type};base64,${base64(bytes)}`;
    } catch {
      return null;
    } finally {
      host.clearTimeout(timer);
    }
  }
  async function readPageFavicon(pageUrl: string): Promise<string | null> {
    const url = new URL(host.chrome.runtime.getURL("/_favicon/"));
    url.searchParams.set("pageUrl", pageUrl);
    url.searchParams.set("size", "32");
    return await readImage(url.toString(), "image/bmp");
  }
  return { readImage, readPageFavicon };
}

export interface AssetContent {
  base64: string;
  contentType: string | null;
}
export interface AssetCdp {
  call(tabId: number, method: string, params?: any): Promise<any>;
  evaluateJavascript(
    tabId: number,
    expression: string,
    options?: { awaitPromise: boolean },
  ): Promise<AssetContent | null>;
}
interface ResourceTree {
  resources?: Array<{ url: string; mimeType?: string | null }>;
  childFrames?: ResourceTree[];
}
/** Original Eoe, serialized into the page execution context. */
export async function fetchAssetInPage({
  url,
}: {
  url: string;
}): Promise<AssetContent> {
  const response = await fetch(url, { credentials: "include", method: "GET" });
  if (!response.ok)
    throw new Error(`Asset request failed with HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer()),
    chunkSize = 32768;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize)
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  return {
    base64: btoa(binary),
    contentType: response.headers.get("content-type"),
  };
}
/** Original oL: parent-first resource lookup, including an empty MIME string. */
export function resourceContentType(
  tree: ResourceTree | null | undefined,
  url: string,
): string | null {
  if (tree == null) return null;
  const type = tree.resources?.find(
    (resource) => resource.url === url,
  )?.mimeType;
  if (type != null) return type;
  for (const child of tree.childFrames ?? []) {
    const type = resourceContentType(child, url);
    if (type != null) return type;
  }
  return null;
}
/** Original Coe: read already-loaded bytes and MIME metadata concurrently. */
export async function loadedAssetContent({
  cdp,
  frameId,
  tabId,
  url,
}: {
  cdp: AssetCdp;
  frameId: string;
  tabId: number;
  url: string;
}): Promise<AssetContent> {
  await cdp.call(tabId, "Page.enable");
  const [content, tree] = await Promise.all([
    cdp.call(tabId, "Page.getResourceContent", { frameId, url }),
    cdp.call(tabId, "Page.getResourceTree"),
  ]);
  return {
    base64:
      content.base64Encoded === true
        ? content.content
        : btoa(
            Array.from(new TextEncoder().encode(content.content), (byte) =>
              String.fromCharCode(byte),
            ).join(""),
          ),
    contentType: resourceContentType(tree.frameTree, url),
  };
}
function assetErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Asset bundling failed";
}
/** Original Toe/Aoe/eL. The initial frame-tree failure is intentionally outside the fallback catch. */
export async function fetchAssetContent({
  cdp,
  ensureFallbackFetchAllowed,
  tabId,
  url,
}: {
  cdp: AssetCdp;
  ensureFallbackFetchAllowed: (url: string) => Promise<unknown>;
  tabId: number;
  url: string;
}): Promise<AssetContent> {
  const frameId =
    (await cdp.call(tabId, "Page.getFrameTree")).frameTree?.frame?.id ?? null;
  let loadedError;
  try {
    if (frameId == null) throw new Error("Unable to determine frame id");
    return await loadedAssetContent({ cdp, frameId, tabId, url });
  } catch (error) {
    loadedError = error;
  }
  await ensureFallbackFetchAllowed(url);
  try {
    const content = await cdp.evaluateJavascript(
      tabId,
      `(${fetchAssetInPage.toString()})(${JSON.stringify({ url })})`,
      { awaitPromise: true },
    );
    if (content == null) throw new Error("Unable to bundle asset");
    return content;
  } catch (error) {
    throw new Error(
      `Loaded resource fetch failed: ${assetErrorMessage(loadedError)}; page fetch failed: ${assetErrorMessage(error)}`,
      { cause: error },
    );
  }
}

export type AssetKind =
  "font" | "image" | "other" | "script" | "stylesheet" | "video";
export interface AssetSource {
  kind: "attribute" | "computedStyle" | "resource";
  nodeId?: number;
  property?: string;
}
export interface PageAsset {
  kind: AssetKind;
  name: string;
  sources: AssetSource[];
  url: string;
}
interface DiscoveryCdp {
  call(tabId: number, method: string, params: any): Promise<any>;
  evaluateJavascript(tabId: number, expression: string): Promise<any>;
}
const computedProperties = [
  "background-image",
  "border-image-source",
  "cursor",
  "list-style-image",
  "mask-image",
];
function snapshotString(strings: string[], index?: number) {
  return index == null || index < 0 ? "" : (strings[index] ?? "");
}
function pathname(value: string) {
  try {
    return new URL(value, "https://example.invalid").pathname;
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value;
  }
}
function fragment(value: string) {
  try {
    return new URL(value, "https://example.invalid").hash.slice(1) || null;
  } catch {
    return value.split("#", 2)[1] || null;
  }
}
export function assetKindFromUrl(value: string): AssetKind {
  const path = pathname(value).toLowerCase();
  return /\.(avif|gif|ico|jpe?g|png|svg|webp)$/.test(path)
    ? "image"
    : /\.(mp4|mov|m4v|webm)$/.test(path)
      ? "video"
      : /\.(otf|ttf|woff2?)$/.test(path)
        ? "font"
        : /\.css$/.test(path)
          ? "stylesheet"
          : /\.m?js$/.test(path)
            ? "script"
            : "other";
}
function assetName(url: string) {
  const name = pathname(url).split("/").filter(Boolean).at(-1);
  if (name) {
    const hash = fragment(url);
    return hash == null ? name : `${name}#${hash}`;
  }
  return url;
}
function resolveAssetUrl(value: string, base: string) {
  try {
    return new URL(value, base || undefined).toString();
  } catch {
    return value;
  }
}
function createAsset({
  kind,
  source,
  url,
}: {
  kind: AssetKind;
  source: AssetSource;
  url: string;
}): PageAsset {
  return {
    kind: kind === "other" ? assetKindFromUrl(url) : kind,
    name: assetName(url),
    sources: [source],
    url,
  };
}
export async function assetId(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest).slice(0, 8), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
async function identifyAssets(assets: PageAsset[]) {
  return await Promise.all(
    assets.map(async (asset) => ({ id: await assetId(asset.url), ...asset })),
  );
}
function mergeAsset(assets: Map<string, PageAsset>, asset: PageAsset) {
  const existing = assets.get(asset.url);
  if (existing == null) {
    assets.set(asset.url, asset);
    return;
  }
  existing.sources.push(...asset.sources);
  if (existing.kind === "other" && asset.kind !== "other")
    existing.kind = asset.kind;
}
function mergeExistingAsset(assets: Map<string, PageAsset>, asset: PageAsset) {
  if (assets.has(asset.url)) mergeAsset(assets, asset);
}
function resourceKind(entry: {
  name?: string;
  initiatorType?: string;
}): AssetKind {
  const kind = assetKindFromUrl(entry.name ?? "");
  if (kind !== "other") return kind;
  switch (entry.initiatorType) {
    case "css":
      return "stylesheet";
    case "font":
      return "font";
    case "img":
      return "image";
    case "script":
      return "script";
    case "video":
      return "video";
    default:
      return assetKindFromUrl(entry.name ?? "");
  }
}
async function performanceAssets({
  cdp,
  tabId,
}: {
  cdp: DiscoveryCdp;
  tabId: number;
}): Promise<PageAsset[]> {
  return (
    (await cdp.evaluateJavascript(
      tabId,
      `performance.getEntriesByType("resource").map((entry) => ({
        initiatorType: "initiatorType" in entry ? entry.initiatorType : undefined,
        name: entry.name,
      }))`,
    )) ?? []
  ).flatMap((entry: { name?: string; initiatorType?: string }) =>
    entry.name
      ? [
          createAsset({
            kind: resourceKind(entry),
            source: { kind: "resource", property: entry.initiatorType },
            url: entry.name,
          }),
        ]
      : [],
  );
}
interface SnapshotNode {
  attributes: Record<string, string>;
  nodeId: number;
  tagName: string;
}
function snapshotNodes(document: any, strings: string[]): SnapshotNode[] {
  return (document.nodes.backendNodeId ?? []).flatMap(
    (nodeId: number, index: number) =>
      nodeId <= 0
        ? []
        : [
            {
              attributes: snapshotAttributes(document, strings, index),
              nodeId,
              tagName: snapshotString(
                strings,
                document.nodes.nodeName?.[index],
              ).toLowerCase(),
            },
          ],
  );
}
function snapshotAttributes(document: any, strings: string[], index: number) {
  const pairs = document.nodes.attributes?.[index] ?? [],
    attributes: Record<string, string> = {};
  for (let offset = 0; offset < pairs.length; offset += 2) {
    const name = snapshotString(strings, pairs[offset]),
      value = snapshotString(strings, pairs[offset + 1]);
    if (name.length > 0) attributes[name] = value;
  }
  return attributes;
}
function addAttribute(
  assets: PageAsset[],
  node: SnapshotNode,
  property: string,
  kind: AssetKind,
  base: string,
) {
  const value = node.attributes[property];
  if (value)
    assets.push(
      createAsset({
        kind,
        source: { kind: "attribute", nodeId: node.nodeId, property },
        url: resolveAssetUrl(value, base),
      }),
    );
}
function addSourceSet(
  assets: PageAsset[],
  node: SnapshotNode,
  property: string,
  kind: AssetKind,
  base: string,
) {
  const value = node.attributes[property];
  if (value)
    for (const candidate of value.split(",")) {
      const url = candidate.trim().split(/\s+/, 1)[0];
      if (url)
        assets.push(
          createAsset({
            kind,
            source: { kind: "attribute", nodeId: node.nodeId, property },
            url: resolveAssetUrl(url, base),
          }),
        );
    }
}
function attributeAssets(node: SnapshotNode, base: string) {
  const assets: PageAsset[] = [];
  switch (node.tagName) {
    case "img":
      addAttribute(assets, node, "src", "image", base);
      addSourceSet(assets, node, "srcset", "image", base);
      break;
    case "source":
      addAttribute(assets, node, "src", "video", base);
      addSourceSet(assets, node, "srcset", "image", base);
      break;
    case "video":
      addAttribute(assets, node, "poster", "image", base);
      addAttribute(assets, node, "src", "video", base);
      break;
    case "script":
      addAttribute(assets, node, "src", "script", base);
      break;
    case "link":
      addAttribute(
        assets,
        node,
        "href",
        node.attributes.rel === "stylesheet" ? "stylesheet" : "other",
        base,
      );
      break;
    case "use":
      addAttribute(assets, node, "href", "image", base);
      addAttribute(assets, node, "xlink:href", "image", base);
      break;
  }
  return assets;
}
function cssUrls(value: string) {
  return [...value.matchAll(/url\((["']?)(.*?)\1\)/g)]
    .map((match) => match[2]?.trim())
    .filter((url): url is string => !!url);
}
function styleAssets(document: any, strings: string[], base: string) {
  const assets: PageAsset[] = [];
  for (const [layoutIndex, nodeIndex] of document.layout.nodeIndex.entries()) {
    const nodeId = document.nodes.backendNodeId?.[nodeIndex];
    if (nodeId == null || nodeId <= 0) continue;
    const styles = document.layout.styles[layoutIndex] ?? [];
    for (const [propertyIndex, property] of computedProperties.entries()) {
      for (const url of cssUrls(snapshotString(strings, styles[propertyIndex])))
        assets.push(
          createAsset({
            kind: "image",
            source: { kind: "computedStyle", nodeId, property },
            url: resolveAssetUrl(url, base),
          }),
        );
    }
  }
  return assets;
}
/** Original XF: DOM/CSS enrich only URLs already present in performance entries. */
export async function discoverPageAssets({
  cdp,
  tabId,
}: {
  cdp: DiscoveryCdp;
  tabId: number;
}) {
  const snapshot = await cdp.call(tabId, "DOMSnapshot.captureSnapshot", {
    computedStyles: [...computedProperties],
    includeDOMRects: false,
  });
  const document = snapshot.documents[0];
  if (document == null)
    return await identifyAssets(await performanceAssets({ cdp, tabId }));
  const base = snapshotString(snapshot.strings, document.documentURL),
    assets = new Map<string, PageAsset>();
  for (const asset of await performanceAssets({ cdp, tabId }))
    mergeAsset(assets, asset);
  for (const node of snapshotNodes(document, snapshot.strings))
    for (const asset of attributeAssets(node, base))
      mergeExistingAsset(assets, asset);
  for (const asset of styleAssets(document, snapshot.strings, base))
    mergeExistingAsset(assets, asset);
  return await identifyAssets([...assets.values()]);
}
/** Original YF: IDs include the original SVG position, even when earlier entries are empty. */
export async function discoverInlineSvgs({
  cdp,
  tabId,
}: {
  cdp: DiscoveryCdp;
  tabId: number;
}) {
  const svgs =
    (await cdp.evaluateJavascript(
      tabId,
      `Array.from(document.querySelectorAll("svg")).map((svg, index) => ({
        markup: svg.outerHTML,
        name:
          svg.getAttribute("aria-label") ||
          svg.querySelector("title")?.textContent?.trim() ||
          svg.id ||
          "svg-" + (index + 1),
      }))`,
    )) ?? [];
  return await Promise.all(
    svgs.flatMap((svg: { markup: string; name?: string }, index: number) => {
      const markup = svg.markup;
      return markup
        ? [
            assetId(`${index}:${markup}`).then((id) => ({
              id,
              markup,
              name: svg.name || `svg-${index + 1}`,
            })),
          ]
        : [];
    }),
  );
}

import {
  discoverPageAssets,
  discoverInlineSvgs,
  assetKindFromUrl,
  type AssetKind,
  type PageAsset,
} from "./asset_discovery";
import { fetchAssetContent } from "./asset_fetch";
import { downloadSourceOrigin } from "./downloads";
type InventoryAsset =
  | { source: "page-asset"; asset: PageAsset & { id: string } }
  | {
      source: "inline-svg";
      asset: { id: string; markup: string; name: string };
    };
interface Inventory {
  assetsById: Map<string, InventoryAsset>;
  documentUrl: string | undefined;
  tabId: number;
}
interface AssetFilesystem {
  tmpDir: string;
  mkdir(path: string, options: { recursive: boolean }): Promise<unknown>;
  rm(
    path: string,
    options: { force: boolean; recursive: boolean },
  ): Promise<unknown>;
  writeFile(path: string, content: string | Uint8Array): Promise<unknown>;
}
interface AssetSecurity {
  createAuthorityBuilder(): {
    downloadFiles(request: Record<string, unknown>): {
      assert(): Promise<unknown>;
    };
  };
}
interface Cdp {
  call(tabId: number, method: string, params?: any): Promise<any>;
  evaluateJavascript(
    tabId: number,
    expression: string,
    options?: any,
  ): Promise<any>;
}
interface Selection {
  assetIds?: string[];
  documentUrl?: string;
  inventoryId: string;
  kinds?: AssetKind[];
  tabId: number;
}
function supported(asset: InventoryAsset) {
  if (asset.source === "inline-svg") return true;
  switch (asset.asset.kind) {
    case "font":
    case "image":
    case "stylesheet":
    case "video":
      return true;
    case "other":
    case "script":
      return false;
  }
}
function kindAcceptsType(kind: AssetKind, type: string | null) {
  if (type == null) return kind === "stylesheet";
  switch (kind) {
    case "font":
      return (
        type.startsWith("font/") ||
        type === "application/font-woff" ||
        type === "application/font-woff2" ||
        type === "application/vnd.ms-fontobject" ||
        type === "application/x-font-opentype" ||
        type === "application/x-font-ttf"
      );
    case "image":
      return type.startsWith("image/");
    case "stylesheet":
      return type === "text/css";
    case "video":
      return type.startsWith("video/");
  }
}
function normalizedType(value: string | null) {
  const type = value?.split(";", 1)[0]?.trim().toLowerCase();
  return type
    ? /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(type)
      ? type
      : "invalid"
    : null;
}
function extension(url: string) {
  let path;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url.split(/[?#]/, 1)[0] ?? url;
  }
  const name = path.split("/").pop() ?? "",
    index = name.lastIndexOf(".");
  return index > 0 ? name.slice(index) : "";
}
function failure(
  contentType: string | null,
  inventoryAsset: InventoryAsset,
  reason: string,
) {
  return {
    contentType,
    id: inventoryAsset.asset.id,
    name: inventoryAsset.asset.name,
    reason,
    url:
      inventoryAsset.source === "inline-svg"
        ? `inline-svg:${inventoryAsset.asset.id}`
        : inventoryAsset.asset.url,
  };
}
/** Closes over the original dt telemetry dependency; data/approval/download paths are implemented here. */
export function createPageAssetsClass(
  reportEvent: (
    runtime: any,
    event: string,
    reason: string,
    fields: Record<string, string>,
    clientInfo: any,
  ) => unknown,
) {
  function reportFailure(
    runtime: any,
    kind: AssetKind,
    type: string | null,
    reason: string,
    clientInfo: any,
  ) {
    reportEvent(
      runtime,
      "browser_use_page_asset_bundle_failed",
      reason,
      { assetKind: kind, contentType: type ?? "missing", failureType: reason },
      clientInfo,
    );
  }
  async function bundleAsset({
    clientInfo,
    cdp,
    directoryPath,
    ensureFallbackFetchAllowed,
    filesystem,
    inventoryAsset,
    runtime,
    tabId,
  }: {
    clientInfo: any;
    cdp: Cdp;
    directoryPath: string;
    ensureFallbackFetchAllowed: (url: string) => Promise<void>;
    filesystem: AssetFilesystem;
    inventoryAsset: InventoryAsset;
    runtime: any;
    tabId: number;
  }) {
    try {
      if (inventoryAsset.source === "inline-svg") {
        const path = `${directoryPath}/${inventoryAsset.asset.id}.svg`;
        await filesystem.writeFile(path, inventoryAsset.asset.markup);
        return {
          asset: {
            contentType: "image/svg+xml",
            id: inventoryAsset.asset.id,
            kind: "image",
            name: inventoryAsset.asset.name,
            path,
            url: `inline-svg:${inventoryAsset.asset.id}`,
          },
        };
      }
      const asset = inventoryAsset.asset;
      const content = await fetchAssetContent({
        cdp,
        ensureFallbackFetchAllowed,
        tabId,
        url: asset.url,
      });
      const type = normalizedType(content.contentType);
      if (!(
        kindAcceptsType(asset.kind, type) ||
        (type === "application/octet-stream" &&
          assetKindFromUrl(asset.url) === asset.kind)
      )) {
        const result = failure(
          type,
          inventoryAsset,
          `Asset response type ${type ?? "missing"} is not valid for ${asset.kind}`,
        );
        reportFailure(
          runtime,
          asset.kind,
          type,
          "content_type_mismatch",
          clientInfo,
        );
        return { failure: result };
      }
      const path = `${directoryPath}/${asset.id}${extension(asset.url)}`;
      await filesystem.writeFile(
        path,
        Uint8Array.from(atob(content.base64), (character) =>
          character.charCodeAt(0),
        ),
      );
      return {
        asset: {
          contentType: content.contentType,
          id: asset.id,
          kind: asset.kind,
          name: asset.name,
          path,
          url: asset.url,
        },
      };
    } catch (error) {
      reportFailure(
        runtime,
        inventoryAsset.source === "inline-svg"
          ? "image"
          : inventoryAsset.asset.kind,
        null,
        "request_failed",
        clientInfo,
      );
      return {
        failure: failure(
          null,
          inventoryAsset,
          error instanceof Error ? error.message : "Asset bundling failed",
        ),
      };
    }
  }
  return class PageAssets {
    cdp: Cdp;
    security: AssetSecurity;
    runtime: any;
    filesystem: AssetFilesystem;
    clientInfo: any;
    inventoriesById = new Map<string, Inventory>();
    constructor(
      cdp: Cdp,
      security: AssetSecurity,
      runtime: any,
      filesystem: AssetFilesystem,
      clientInfo: any,
    ) {
      this.cdp = cdp;
      this.security = security;
      this.runtime = runtime;
      this.filesystem = filesystem;
      this.clientInfo = clientInfo;
    }
    async list({
      documentUrl,
      tabId,
    }: {
      documentUrl?: string;
      tabId: number;
    }) {
      const [assets, inlineSvgs] = await Promise.all([
        discoverPageAssets({ cdp: this.cdp, tabId }),
        discoverInlineSvgs({ cdp: this.cdp, tabId }),
      ]);
      const id = this.createInventory({
        assets,
        documentUrl,
        inlineSvgs,
        tabId,
      });
      const byKind = {
        font: 0,
        image: 0,
        other: 0,
        script: 0,
        stylesheet: 0,
        video: 0,
      };
      for (const asset of assets) byKind[asset.kind] += 1;
      return {
        assets,
        id,
        inlineSvgs,
        pageUrl: documentUrl ?? null,
        summary: {
          byKind,
          inlineSvgCount: inlineSvgs.length,
          totalCount: assets.length,
        },
      };
    }
    async bundle({
      assetIds,
      documentUrl,
      inventoryId,
      kinds,
      tabId,
    }: Selection) {
      const started = performance.now(),
        selected = this.getAssets({
          assetIds,
          documentUrl,
          inventoryId,
          kinds,
          tabId,
        });
      if (selected == null)
        throw new Error("Asset inventory is no longer valid for this page");
      if (selected.missingAssetIds.length > 0)
        throw new Error("Asset bundle request included unknown asset ids");
      if (
        assetIds != null &&
        selected.assets.some((asset) => !supported(asset))
      )
        throw new Error(
          "Asset bundle request included unsupported asset kinds",
        );
      const assets = selected.assets.filter(supported);
      if (assets.length === 0)
        throw new Error("Asset bundle request matched no discovered assets");
      await this.security
        .createAuthorityBuilder()
        .downloadFiles({ type: "page-assets", pageUrl: documentUrl })
        .assert();
      const directoryPath = `${this.filesystem.tmpDir}/browser-use/assets/${crypto.randomUUID()}`;
      await this.filesystem.mkdir(directoryPath, { recursive: true });
      const approvals = new Map<string, Promise<void>>();
      let approvalError: Error | undefined,
        tail = Promise.resolve();
      const ensureFallbackFetchAllowed = (url: string) => {
        const origin = downloadSourceOrigin(url) ?? url,
          existing = approvals.get(origin);
        if (existing != null) return existing;
        const approval = tail.then(async () => {
          if (approvalError != null) throw approvalError;
          try {
            await this.security
              .createAuthorityBuilder()
              .downloadFiles({
                type: "page-asset-fetch",
                pageUrl: documentUrl,
                assetUrl: url,
              })
              .assert();
          } catch (error) {
            approvalError =
              error instanceof Error
                ? error
                : new Error("Page asset fallback download approval failed");
            throw approvalError;
          }
        });
        approvals.set(origin, approval);
        tail = approval.catch(() => {});
        return approval;
      };
      const results = await Promise.all(
        assets.map((inventoryAsset) =>
          bundleAsset({
            cdp: this.cdp,
            directoryPath,
            ensureFallbackFetchAllowed,
            filesystem: this.filesystem,
            inventoryAsset,
            runtime: this.runtime,
            clientInfo: this.clientInfo,
            tabId,
          }),
        ),
      );
      if (approvalError != null) {
        await this.filesystem.rm(directoryPath, {
          force: true,
          recursive: true,
        });
        throw approvalError;
      }
      const downloaded = results.flatMap((result) =>
        result.asset == null ? [] : [result.asset],
      );
      const failures = results.flatMap((result) =>
        result.failure == null ? [] : [result.failure],
      );
      const manifestPath = `${directoryPath}/manifest.json`;
      await this.filesystem.writeFile(
        manifestPath,
        JSON.stringify({ assets: downloaded, failures }, null, 2),
      );
      return {
        assets: downloaded,
        directoryPath,
        failures,
        manifestPath,
        summary: {
          downloadedCount: downloaded.length,
          elapsedMs: performance.now() - started,
          failedCount: failures.length,
          requestedCount: assets.length,
        },
      };
    }
    createInventory({
      assets,
      documentUrl,
      inlineSvgs,
      tabId,
    }: {
      assets: Array<PageAsset & { id: string }>;
      documentUrl?: string;
      inlineSvgs: Array<{ id: string; markup: string; name: string }>;
      tabId: number;
    }) {
      const id = crypto.randomUUID(),
        assetsById = new Map<string, InventoryAsset>();
      for (const asset of assets)
        assetsById.set(asset.id, { source: "page-asset", asset });
      for (const asset of inlineSvgs)
        assetsById.set(asset.id, { source: "inline-svg", asset });
      this.inventoriesById.set(id, { assetsById, documentUrl, tabId });
      return id;
    }
    getAssets({ assetIds, documentUrl, inventoryId, kinds, tabId }: Selection) {
      const inventory = this.inventoriesById.get(inventoryId);
      if (
        inventory == null ||
        inventory.documentUrl !== documentUrl ||
        inventory.tabId !== tabId
      )
        return null;
      const missingAssetIds =
        assetIds?.filter((id) => !inventory.assetsById.has(id)) ?? [];
      return {
        assets: (assetIds == null
          ? [...inventory.assetsById.values()]
          : assetIds.flatMap((id) => {
              const asset = inventory.assetsById.get(id);
              return asset == null ? [] : [asset];
            })
        ).filter(
          (asset) =>
            kinds == null ||
            kinds.includes(
              asset.source === "inline-svg" ? "image" : asset.asset.kind,
            ),
        ),
        missingAssetIds,
      };
    }
  };
}

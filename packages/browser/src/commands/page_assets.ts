import { z } from "../vendor/bundled_zod";
import { Command } from "./command";
// Original Ju/Gu/Hu/Yu/Xu/Qu/eh/th/rh/ah.
const assetKind = z.enum([
  "font",
  "image",
  "script",
  "stylesheet",
  "video",
  "other",
]);
const downloadableKind = z.enum(["font", "image", "stylesheet", "video"]);
const assetSource = z.object({
  kind: z.enum(["attribute", "computedStyle", "resource"]),
  nodeId: z.number().int().positive().optional(),
  property: z.string().optional(),
});
const asset = z.object({
  id: z.string(),
  kind: assetKind,
  name: z.string(),
  sources: z.array(assetSource),
  url: z.string(),
});
const inlineSvg = z.object({
  id: z.string(),
  markup: z.string(),
  name: z.string(),
});
const inventory = z.object({
  assets: z.array(asset),
  id: z.string(),
  inlineSvgs: z.array(inlineSvg),
  pageUrl: z.string().nullable(),
  summary: z.object({
    byKind: z.record(assetKind, z.number().int().nonnegative()),
    inlineSvgCount: z.number().int().nonnegative(),
    totalCount: z.number().int().nonnegative(),
  }),
});
const bundleOptions = z.object({
  assetIds: z.array(z.string()).optional(),
  inventoryId: z.string(),
  kinds: z.array(downloadableKind).optional(),
});
const bundledAsset = z.object({
  contentType: z.string().nullable(),
  id: z.string(),
  kind: downloadableKind,
  name: z.string(),
  path: z.string(),
  url: z.string(),
});
const failedAsset = z.object({
  contentType: z.string().nullable(),
  id: z.string(),
  name: z.string(),
  reason: z.string(),
  url: z.string(),
});
const bundleResult = z.object({
  assets: z.array(bundledAsset),
  directoryPath: z.string(),
  failures: z.array(failedAsset),
  manifestPath: z.string(),
  summary: z.object({
    downloadedCount: z.number().int().nonnegative(),
    elapsedMs: z.number().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    requestedCount: z.number().int().nonnegative(),
  }),
});
export namespace PageAssetsBundle {
  export const commandType = "tab_page_assets_bundle";
  export const PayloadSchema = bundleOptions.extend({
    browser_id: z.string(),
    tab_id: z.string(),
  });
  export const ResultSchema = bundleResult;
  export function create(payload: {
    assetIds?: string[];
    inventoryId: string;
    kinds?: string[];
    browser_id: string;
    tab_id: string;
  }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export namespace PageAssetsList {
  export const commandType = "tab_page_assets_list";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
  });
  export const ResultSchema = inventory;
  export function create(payload: { browser_id: string; tab_id: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export const TabPageAssetsCommands = {
  Bundle: PageAssetsBundle,
  List: PageAssetsList,
};

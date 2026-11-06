import { SiwcDetectionSchema } from "./siwc";
// Generated from original AST schema expressions; identifiers expanded and payload types inferred.
// Regenerate with node scripts/reconstruct-input-schemas.mjs.
import { z } from "../vendor/bundled_zod";
import { Command } from "./command";
type PageTarget = { browser_id: string; tab_id: string };
const waitUntilSchema = z.enum([
  "load",
  "domcontentloaded",
  "networkidle",
  "commit",
]);
const loadStateSchema = z.enum(["load", "domcontentloaded", "networkidle"]);
const boundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
const selectorInfoSchema = z.object({
  primary: z.string().nullable().optional(),
  candidates: z.array(z.string()),
  frameSelectors: z.array(z.string()).optional(),
});
const elementInfoSchema = z.object({
  nodeId: z.number().int().positive().nullable().optional(),
  tagName: z.string(),
  role: z.string().nullable().optional(),
  visibleText: z.string().nullable().optional(),
  ariaName: z.string().nullable().optional(),
  testId: z.string().nullable().optional(),
  boundingBox: boundingBoxSchema.nullable().optional(),
  preview: z.string(),
  selector: selectorInfoSchema,
});
/** Original ad (sd/nd). */
export namespace WaitForUrl {
  export const commandType = "playwright_wait_for_url";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    url: z.string(),
    wait_until: waitUntilSchema.optional(),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({ url: z.string().optional() });
  export function create(
    payload: PageTarget & {
      url: string;
      wait_until?: string;
      timeout_ms?: number;
    },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original dd (ud/hd). */
export namespace WaitForLoadState {
  export const LoadStateSchema = loadStateSchema;
  export const commandType = "playwright_wait_for_load_state";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    state: loadStateSchema.optional(),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({});
  export function create(
    payload: PageTarget & { state?: string; timeout_ms?: number },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original bd (_d/yd). */
export namespace WaitForTimeout {
  export const commandType = "playwright_wait_for_timeout";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    timeout_ms: z.number().int().nonnegative(),
  });
  export const ResultSchema = z.object({});
  export function create(payload: PageTarget & { timeout_ms: number }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original wd (vd/xd). */
export namespace DomSnapshot {
  export const commandType = "playwright_dom_snapshot";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
  });
  export const ResultSchema = z.object({
    dom_snapshot: z.string(),
    snapshotId: z.string().optional(),
    siwc: SiwcDetectionSchema.optional(),
  });
  export function create(payload: PageTarget & {}) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original Td (Rd/Pd). */
export namespace ElementInfo {
  export const commandType = "playwright_element_info";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    x: z.number(),
    y: z.number(),
    include_non_interactable: z.boolean().optional(),
  });
  export const ResultSchema = z.array(elementInfoSchema);
  export function create(
    payload: PageTarget & {
      x: number;
      y: number;
      include_non_interactable?: boolean;
    },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original Md (Od/$d). */
export namespace ElementScreenshot {
  export const commandType = "playwright_element_screenshot";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    x: z.number(),
    y: z.number(),
    include_non_interactable: z.boolean().optional(),
  });
  export const ResultSchema = z.object({ data: z.string() });
  export function create(
    payload: PageTarget & {
      x: number;
      y: number;
      include_non_interactable?: boolean;
    },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original qd (Dd/Ld). */
export namespace WaitForDownload {
  export const commandType = "playwright_wait_for_download";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({ download_id: z.string() });
  export function create(payload: PageTarget & { timeout_ms?: number }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original Ud (zd/Vd). */
export namespace DownloadPath {
  export const commandType = "playwright_download_path";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    download_id: z.string(),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({ path: z.string().nullable() });
  export function create(
    payload: PageTarget & { download_id: string; timeout_ms?: number },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original Jd (Gd/Hd). */
export namespace WaitForFileChooser {
  export const commandType = "playwright_wait_for_file_chooser";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({
    file_chooser_id: z.string(),
    is_multiple: z.boolean(),
  });
  export function create(payload: PageTarget & { timeout_ms?: number }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original Qd (el/tl). */
export namespace FileChooserSetFiles {
  export const commandType = "playwright_file_chooser_set_files";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    file_chooser_id: z.string(),
    files: z.array(z.string()),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({});
  export function create(
    payload: PageTarget & {
      file_chooser_id: string;
      files: string[];
      timeout_ms?: number;
    },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

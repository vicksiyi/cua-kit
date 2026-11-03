// Generated from original AST schema expressions; identifiers expanded and payload types inferred.
// Regenerate with node scripts/reconstruct-input-schemas.mjs.
import { z } from "../vendor/bundled_zod";
import { Command } from "./command";
type TabTarget = { browser_id: string; tab_id: string };
const markTabStatusSchema = z.enum(["handoff", "deliverable"]);
const handoffReasonSchema = z.enum([
  "authentication",
  "captcha",
  "user_requested",
  "other",
]);
const jsDialogTypeSchema = z.enum([
  "alert",
  "beforeunload",
  "confirm",
  "prompt",
]);
const resultDialogSchema = z.object({
  id: z.string(),
  type: jsDialogTypeSchema,
});

/** Original Dr (Lr/Br). */
export namespace CloseTab {
  export const commandType = "close_tab";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
  });
  export const ResultSchema = z.object({});
  export function create(payload: TabTarget & {}) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Original zr (Wr/Kr). */
export namespace MarkTab {
  export const MarkTabStatusSchema = markTabStatusSchema;
  export const commandType = "mark_tab";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    status: markTabStatusSchema,
  });
  export const ResultSchema = z.object({});
  export function create(
    payload: TabTarget & { status: "handoff" | "deliverable" },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Original Hr (Qr/ea). */
export namespace ManualHandoff {
  export const ReasonSchema = handoffReasonSchema;
  export const commandType = "tab_manual_handoff_request";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    reason: handoffReasonSchema.optional(),
  });
  export const ResultSchema = z.object({});
  export function create(
    payload: TabTarget & {
      reason?: "authentication" | "captcha" | "user_requested" | "other";
    },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Original La (Ba/Fa). */
export namespace NavigateTab {
  export const commandType = "navigate_tab_url";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    url: z.string(),
  });
  export const ResultSchema = z.object({});
  export function create(payload: TabTarget & { url: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Original Va (Wa/Ka). */
export namespace NavigateTabBack {
  export const commandType = "navigate_tab_back";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
  });
  export const ResultSchema = z.object({});
  export function create(payload: TabTarget & {}) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Original Ha (Ya/Xa). */
export namespace NavigateTabForward {
  export const commandType = "navigate_tab_forward";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
  });
  export const ResultSchema = z.object({});
  export function create(payload: TabTarget & {}) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Original ti (ri/ai). */
export namespace NavigateTabReload {
  export const commandType = "navigate_tab_reload";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
  });
  export const ResultSchema = z.object({});
  export function create(payload: TabTarget & {}) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Original Ps (Es/As). */
export namespace TabScreenshot {
  export const commandType = "tab_screenshot";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    fullPage: z.boolean().optional(),
    cropX: z.number().optional(),
    cropY: z.number().optional(),
    cropWidth: z.number().optional(),
    cropHeight: z.number().optional(),
  });
  export const ResultSchema = z.object({ data: z.string() });
  export function create(
    payload: TabTarget & {
      fullPage?: boolean;
      cropX?: number;
      cropY?: number;
      cropWidth?: number;
      cropHeight?: number;
    },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Original Ai ($i/Zi). */
export namespace TabGetJsDialog {
  export const JsDialogTypeSchema = jsDialogTypeSchema;
  export const ResultDialogSchema = resultDialogSchema;
  export const commandType = "tab_get_js_dialog";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
  });
  export const ResultSchema = z.object({
    dialog: resultDialogSchema.nullable(),
  });
  export function create(payload: TabTarget & {}) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Original Di (Li/Bi). */
export namespace TabHandleJsDialog {
  export const commandType = "tab_handle_js_dialog";
  export const PayloadSchema = z.object({
    action: z.enum(["accept", "dismiss"]),
    browser_id: z.string(),
    dialog_id: z.string(),
    prompt_text: z.string().optional(),
    tab_id: z.string(),
  });
  export const ResultSchema = z.object({});
  export function create(
    payload: TabTarget & {
      action: "accept" | "dismiss";
      dialog_id: string;
      prompt_text?: string;
    },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

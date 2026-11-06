// Generated from original AST schema expressions; identifiers expanded and payload types inferred.
// Regenerate with node scripts/reconstruct-input-schemas.mjs.
import { z } from "../vendor/bundled_zod";
import { Command } from "./command";
type LocatorTarget = { browser_id: string; tab_id: string; selector: string };
const selectOptionSchema = z
  .object({
    value: z.string().optional(),
    label: z.string().optional(),
    index: z.number().int().nonnegative().optional(),
  })
  .superRefine(
    (
      selection: { value?: string; label?: string; index?: number },
      context: { addIssue(issue: unknown): void },
    ) => {
      void 0 === selection.value &&
        void 0 === selection.label &&
        void 0 === selection.index &&
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Select option requires value, label, or index",
        });
    },
  );
/** Original Ao (Mo/Oo). */
export namespace LocatorClick {
  export const commandType = "playwright_locator_click";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    selector: z.string(),
    modifiers: z
      .array(z.enum(["Alt", "Control", "ControlOrMeta", "Meta", "Shift"]))
      .optional(),
    button: z.enum(["left", "right", "middle"]).optional(),
    force: z.boolean().optional(),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({});

  export function create(
    payload: LocatorTarget & {
      modifiers?: string[];
      button?: string;
      force?: boolean;
      timeout_ms?: number;
    },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original $o (qo/Do). */
export namespace LocatorDoubleClick {
  export const commandType = "playwright_locator_dblclick";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    selector: z.string(),
    modifiers: z
      .array(z.enum(["Alt", "Control", "ControlOrMeta", "Meta", "Shift"]))
      .optional(),
    button: z.enum(["left", "right", "middle"]).optional(),
    force: z.boolean().optional(),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({});

  export function create(
    payload: LocatorTarget & {
      modifiers?: string[];
      button?: string;
      force?: boolean;
      timeout_ms?: number;
    },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original Fo (Uo/zo). */
export namespace LocatorDownloadMedia {
  export const commandType = "playwright_locator_download_media";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    selector: z.string(),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({ path: z.string() });

  export function create(payload: LocatorTarget & { timeout_ms?: number }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original Ko (Jo/Go). */
export namespace LocatorFill {
  export const commandType = "playwright_locator_fill";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    selector: z.string(),
    value: z.string(),
    replace: z.boolean(),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({});

  export function create(
    payload: LocatorTarget & {
      value: string;
      replace: boolean;
      timeout_ms?: number;
    },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original Xo (Qo/ec). */
export namespace LocatorPress {
  export const commandType = "playwright_locator_press";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    selector: z.string(),
    value: z.string(),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({});

  export function create(
    payload: LocatorTarget & { value: string; timeout_ms?: number },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original ac (ic/nc). */
export namespace LocatorPressSequentially {
  export const commandType = "playwright_locator_press_sequentially";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    selector: z.string(),
    value: z.string(),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({});

  export function create(
    payload: LocatorTarget & { value: string; timeout_ms?: number },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original cc (dc/lc). */
export namespace LocatorWaitFor {
  export const commandType = "playwright_locator_wait_for";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    selector: z.string(),
    state: z.enum(["attached", "detached", "visible", "hidden"]),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({});

  export function create(
    payload: LocatorTarget & { state: string; timeout_ms?: number },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original mc (pc/bc). */
export namespace LocatorCount {
  export const commandType = "playwright_locator_count";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    selector: z.string(),
  });
  export const ResultSchema = z.object({ count: z.number().int() });

  export function create(payload: LocatorTarget & {}) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original yc (wc/vc). */
export namespace LocatorSelectOption {
  export const commandType = "playwright_locator_select_option";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    selector: z.string(),
    selections: z.array(selectOptionSchema).min(1),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({});
  export const SelectOptionSchema = selectOptionSchema;
  export function create(
    payload: LocatorTarget & {
      selections: Array<{ value?: string; label?: string; index?: number }>;
      timeout_ms?: number;
    },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original Sc (jc/Tc). */
export namespace LocatorSetChecked {
  export const commandType = "playwright_locator_set_checked";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    selector: z.string(),
    checked: z.boolean(),
    force: z.boolean().optional(),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({});

  export function create(
    payload: LocatorTarget & {
      checked: boolean;
      force?: boolean;
      timeout_ms?: number;
    },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original Rc (Pc/Ec). */
export namespace LocatorIsVisible {
  export const commandType = "playwright_locator_is_visible";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    selector: z.string(),
  });
  export const ResultSchema = z.object({ value: z.boolean() });

  export function create(payload: LocatorTarget & {}) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original Oc (Zc/Nc). */
export namespace LocatorIsEnabled {
  export const commandType = "playwright_locator_is_enabled";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    selector: z.string(),
  });
  export const ResultSchema = z.object({ value: z.boolean() });

  export function create(payload: LocatorTarget & {}) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original Dc (Lc/Bc). */
export namespace LocatorAllTextContents {
  export const commandType = "playwright_locator_all_text_contents";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    selector: z.string(),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({ values: z.array(z.string()) });

  export function create(payload: LocatorTarget & { timeout_ms?: number }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original zc (Vc/Wc). */
export namespace LocatorTextContent {
  export const commandType = "playwright_locator_text_content";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    selector: z.string(),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({ value: z.string().nullable() });

  export function create(payload: LocatorTarget & { timeout_ms?: number }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original Gc (Hc/Yc). */
export namespace LocatorInnerText {
  export const commandType = "playwright_locator_inner_text";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    selector: z.string(),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({ value: z.string() });

  export function create(payload: LocatorTarget & { timeout_ms?: number }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original ed (td/rd). */
export namespace LocatorGetAttribute {
  export const commandType = "playwright_locator_get_attribute";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    selector: z.string(),
    name: z.string(),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({ value: z.string().nullable() });

  export function create(
    payload: LocatorTarget & { name: string; timeout_ms?: number },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original is/ns/ss/os. Shared by page and locator evaluation. */
export namespace PlaywrightEvaluate {
  export const commandType = "playwright_evaluate";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    selector: z.string().optional(),
    selector_mode: z.literal("all").optional(),
    tab_id: z.string(),
    script: z.string(),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({ value: z.unknown().optional() });
  export function create(payload: {
    browser_id: string;
    tab_id: string;
    script: string;
    selector?: string;
    selector_mode?: "all";
    timeout_ms?: number;
  }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

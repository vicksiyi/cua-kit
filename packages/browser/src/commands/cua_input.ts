// Generated from original AST schema expressions; identifiers expanded and payload types inferred.
// Regenerate with node scripts/reconstruct-input-schemas.mjs.
import { z } from "../vendor/bundled_zod";
import { Command } from "./command";
type InputTarget = { browser_id: string; tab_id: string };
const domNodeIdSchema = z
  .string({
    required_error: "node_id is required",
    invalid_type_error: "node_id must be a string",
  })
  .min(1, "node_id must not be empty");

/** Original en (tn/rn). */
export namespace CuaClick {
  export const commandType = "cua_click";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    x: z.number(),
    y: z.number(),
    button: z.number().optional(),
    keys: z.array(z.string()).optional(),
  });
  export const ResultSchema = z.object({});
  export function create(
    payload: InputTarget & {
      x: number;
      y: number;
      button?: number;
      keys?: string[];
    },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Original nn (on/cn). */
export namespace CuaDownloadMedia {
  export const commandType = "cua_download_media";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    x: z.number(),
    y: z.number(),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({});
  export function create(
    payload: InputTarget & { x: number; y: number; timeout_ms?: number },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Original un (hn/mn). */
export namespace CuaDoubleClick {
  export const commandType = "cua_double_click";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    x: z.number(),
    y: z.number(),
    keys: z.array(z.string()).optional(),
  });
  export const ResultSchema = z.object({});
  export function create(
    payload: InputTarget & { x: number; y: number; keys?: string[] },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Current client Ss (js/Ts): duration is finite seconds in [0, 30]. */
export namespace CuaKeypress {
  export const commandType = "cua_keypress";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    keys: z.array(z.string()),
    duration: z.number().finite().min(0).max(30).optional(),
  });
  export const ResultSchema = z.object({});
  export function create(
    payload: InputTarget & { keys: string[]; duration?: number },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Original vn (xn/kn). */
export namespace CuaDrag {
  export const commandType = "cua_drag";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    path: z.array(z.object({ x: z.number(), y: z.number() })),
    keys: z.array(z.string()).optional(),
  });
  export const ResultSchema = z.object({});
  export function create(
    payload: InputTarget & {
      path: Array<{ x: number; y: number }>;
      keys?: string[];
    },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Original jn (In/Cn). */
export namespace CuaMove {
  export const commandType = "cua_move";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    x: z.number(),
    y: z.number(),
    keys: z.array(z.string()).optional(),
  });
  export const ResultSchema = z.object({});
  export function create(
    payload: InputTarget & { x: number; y: number; keys?: string[] },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Original En (An/Mn). */
export namespace CuaScroll {
  export const commandType = "cua_scroll";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    x: z.number(),
    y: z.number(),
    scroll_x: z.number(),
    scroll_y: z.number(),
    keys: z.array(z.string()).optional(),
  });
  export const ResultSchema = z.object({});
  export function create(
    payload: InputTarget & {
      x: number;
      y: number;
      scroll_x: number;
      scroll_y: number;
      keys?: string[];
    },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Original Zn (Nn/qn). */
export namespace CuaType {
  export const commandType = "cua_type";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    text: z.string(),
  });
  export const ResultSchema = z.object({});
  export function create(payload: InputTarget & { text: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Original Bn (Un/zn). */
export namespace DomCuaClick {
  export const DomNodeIdSchema = domNodeIdSchema;
  export const commandType = "dom_cua_click";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    node_id: domNodeIdSchema,
  });
  export const ResultSchema = z.object({});
  export function create(payload: InputTarget & { node_id: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Original Kn (Jn/Gn). */
export namespace DomCuaDownloadMedia {
  export const commandType = "dom_cua_download_media";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    node_id: domNodeIdSchema,
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({});
  export function create(
    payload: InputTarget & { node_id: string; timeout_ms?: number },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Original Xn (Qn/eo). */
export namespace DomCuaDoubleClick {
  export const commandType = "dom_cua_double_click";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    node_id: domNodeIdSchema,
  });
  export const ResultSchema = z.object({});
  export function create(payload: InputTarget & { node_id: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Original ao (io/so). */
export namespace DomCuaGetVisibleDom {
  export const commandType = "dom_cua_get_visible_dom";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
  });
  export const ResultSchema = z.unknown();
  export function create(payload: InputTarget & {}) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Original co (lo/uo). */
export namespace DomCuaKeypress {
  export const commandType = "dom_cua_keypress";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    keys: z.array(z.string()),
  });
  export const ResultSchema = z.object({});
  export function create(payload: InputTarget & { keys: string[] }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Original po (bo/_o). */
export namespace DomCuaScroll {
  export const commandType = "dom_cua_scroll";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    scroll_x: z.number(),
    scroll_y: z.number(),
    node_id: domNodeIdSchema.optional(),
  });
  export const ResultSchema = z.object({});
  export function create(
    payload: InputTarget & {
      scroll_x: number;
      scroll_y: number;
      node_id?: string;
    },
  ) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

/** Original go (wo/vo). */
export namespace DomCuaType {
  export const commandType = "dom_cua_type";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    text: z.string(),
  });
  export const ResultSchema = z.object({});
  export function create(payload: InputTarget & { text: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

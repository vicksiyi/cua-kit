import { z } from "../vendor/bundled_zod";
import { Command } from "./command";
export const StatePayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  content: z.enum(["axState", "screenshot", "axStateAndScreenshot"]),
  disable_diffing: z.boolean().optional(),
});
export const StateResultSchema = z.object({
  state: z.string().optional(),
  data: z.string().optional(),
  screenshot_unavailable: z.string().optional(),
});
export const PointSchema = z.tuple([z.number(), z.number()]);
export const ElementSchema = z.number().int().nonnegative();
export const TargetSchema = z.union([ElementSchema, PointSchema]);
export const ActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("paste"),
    element_index: ElementSchema.nullable(),
    text: z.string(),
    format: z.enum(["text", "md", "html"]).optional(),
  }),
  z.object({
    kind: z.literal("click"),
    target: TargetSchema,
    mouse_button: z.enum(["left", "right", "middle", "l", "r", "m"]).optional(),
    click_count: z.number().int().positive().optional(),
    key: z.string().optional(),
    duration: z.number().finite().min(0).max(30).optional(),
  }),
  z.object({ kind: z.literal("drag"), from: PointSchema, to: PointSchema }),
  z.object({
    kind: z.literal("perform_secondary_action"),
    element_index: ElementSchema,
    action: z.string(),
  }),
  z.object({
    kind: z.literal("press_key"),
    element_index: ElementSchema.nullable(),
    key: z.string(),
    duration: z.number().finite().min(0).max(30).optional(),
  }),
  z.object({
    kind: z.literal("scroll"),
    target: TargetSchema,
    direction: z.enum(["up", "down", "left", "right", "u", "d", "l", "r"]),
    pages: z.number().optional(),
  }),
  z.object({
    kind: z.literal("select_text"),
    element_index: ElementSchema,
    text: z.string(),
    prefix: z.string().optional(),
    suffix: z.string().optional(),
    selection_type: z
      .enum(["text", "cursor_before", "cursor_after"])
      .optional(),
  }),
  z.object({
    kind: z.literal("set_value"),
    element_index: ElementSchema,
    value: z.string(),
  }),
  z.object({
    kind: z.literal("type_text"),
    element_index: ElementSchema.nullable(),
    text: z.string(),
  }),
]);
export const ActionPayloadSchema = z.object({
  browser_id: z.string(),
  tab_id: z.string(),
  action: ActionSchema,
});
export const ActionResultSchema = z.object({});
export const StateCommand = {
  PayloadSchema: StatePayloadSchema,
  ResultSchema: StateResultSchema,
  commandType: "tab_ax_get_state",
  create: (payload: Record<string, unknown>) =>
    new Command("tab_ax_get_state", StatePayloadSchema, payload),
};
export const ActionCommand = {
  ActionSchema,
  PayloadSchema: ActionPayloadSchema,
  ResultSchema: ActionResultSchema,
  commandType: "tab_ax_action",
  create: (payload: Record<string, unknown>) =>
    new Command("tab_ax_action", ActionPayloadSchema, payload),
};

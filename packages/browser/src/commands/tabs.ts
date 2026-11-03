import { z } from "../vendor/bundled_zod";
import { Command } from "./command";

// Original Rr/Or/ha/ya/xa commands and their schemas, in original field order.
export namespace CreateTabCommand {
  export const commandType = "create_tab";
  export const PayloadSchema = z.object({ browser_id: z.string() });
  export const ResultSchema = z.object({ id: z.string() });
  export function create(payload: { browser_id: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export namespace GetTabCommand {
  export const commandType = "get_tab";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
  });
  export const ResultSchema = z.object({
    id: z.string(),
    title: z.string().optional(),
    url: z.string().optional(),
  });
  export function create(payload: { browser_id: string; tab_id: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export namespace SelectedTabCommand {
  export const commandType = "selected_tab";
  export const PayloadSchema = z.object({ browser_id: z.string() });
  export const ResultSchema = z.object({ id: z.string().optional() });
  export function create(payload: { browser_id: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export namespace ListTabsCommand {
  export const commandType = "list_tabs";
  export const PayloadSchema = z.object({ browser_id: z.string() });
  export const ResultSchema = z.object({
    tabs: z.array(
      z.object({
        id: z.string(),
        providerTabId: z.string().optional(),
        url: z.string().optional(),
        title: z.string().optional(),
      }),
    ),
  });
  export function create(payload: { browser_id: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export namespace TabsContentCommand {
  export const commandType = "tabs_content";
  export const ContentTypeSchema = z.enum(["html", "text", "domSnapshot"]);
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    urls: z.array(z.string()),
    content_type: ContentTypeSchema,
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({
    results: z.array(
      z.object({
        url: z.string(),
        title: z.string().nullable(),
        content: z.string().nullable(),
      }),
    ),
  });
  export function create(payload: {
    browser_id: string;
    urls: string[];
    content_type: string;
    timeout_ms?: number;
  }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

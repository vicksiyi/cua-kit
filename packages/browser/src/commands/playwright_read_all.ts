import { z } from "../vendor/bundled_zod";
import { Command } from "./command";
/** Original Yc/Xc/Qc/ed/td/rd. create retains raw input; validation is explicit. */
export namespace PlaywrightLocatorReadAll {
  export const commandType = "playwright_locator_read_all";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    selector: z.string(),
    relative_selector: z.string().optional(),
    timeout_ms: z.number().int().positive().optional(),
  });
  const itemSchema = z.object({
    attributes: z.record(z.string()),
    inner_text: z.string(),
    text_content: z.string().nullable(),
  });
  export const ResultSchema = z.object({
    values: z.array(itemSchema.nullable()),
  });
  export type Payload = {
    browser_id: string;
    tab_id: string;
    selector: string;
    relative_selector?: string;
    timeout_ms?: number;
  };
  export interface Item {
    attributes: Record<string, string>;
    inner_text: string;
    text_content: string | null;
  }
  export function create(payload: Payload) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

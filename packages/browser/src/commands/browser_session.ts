import { z } from "../vendor/bundled_zod";
import { Command } from "./command";
/** Original gr/wr/vr/xr. */
export namespace BrowserDocumentation {
  export const commandType = "get_browser_documentation";
  export const PayloadSchema = z.object({ browser_id: z.string() });
  export const ResultSchema = z.string();
  export function create(payload: { browser_id: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original oa/ca/da/la. */
export namespace NameSession {
  export const commandType = "name_session";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    name: z.string(),
  });
  export const ResultSchema = z.object({});
  export function create(payload: { browser_id: string; name: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original vi/xi/ki/Si. */
export namespace BrowserHistory {
  export const commandType = "browser_user_history";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    queries: z.array(z.string()).min(1).optional(),
    limit: z.number().int().positive().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  });
  export const ResultSchema = z.object({
    items: z.array(
      z.object({
        url: z.string(),
        title: z.string().optional(),
        dateVisited: z.string(),
      }),
    ),
  });
  export type Payload = {
    browser_id: string;
    queries?: string[];
    limit?: number;
    from?: string;
    to?: string;
  };
  export function create(payload: Payload) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

import { z } from "../vendor/bundled_zod";
import { Command } from "./command";
/** Original ra/aa/ia/sa/na. */
export namespace RuntimeConfig {
  export const PayloadSchema = z.object({ browser_id: z.string() });
  export const ResultSchema = z.object({
    display_truncate_max_chars: z.number().int().positive().optional(),
  });
  export const commandType = "runtime_config";
  export function create(payload: { browser_id: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}

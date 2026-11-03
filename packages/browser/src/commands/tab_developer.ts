import { z } from "../vendor/bundled_zod";
import { Command } from "./command";
const botDetectionReasonSchema = z.enum([
  "captcha_failed",
  "access_denied",
  "challenge_loop",
  "sign_in_blocked",
  "add_to_cart_blocked",
  "purchase_blocked",
  "unexpected_bot_error",
]);
const reportSchema = z.object({ reason: botDetectionReasonSchema });
/** Original tu/su/nu. */
export namespace BotDetectionReport {
  export const commandType = "tab_bot_detection_report";
  export const PayloadSchema = reportSchema.extend({
    browser_id: z.string(),
    tab_id: z.string(),
  });
  export const ResultSchema = z.object({
    status: z.literal("reported"),
    hostname: z.string().nullable(),
  });
  export function create(payload: {
    reason: string;
    browser_id: string;
    tab_id: string;
  }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
const targetSchema = z
  .object({
    session_id: z.string().min(1).optional(),
    target_id: z.string().min(1).optional(),
  })
  .refine(
    (target: any) => (target.session_id == null) != (target.target_id == null),
    "CDP target must provide exactly one of session_id or target_id.",
  );
const sourceSchema = z.object({
  extensionId: z.string().optional(),
  sessionId: z.string().optional(),
  tabId: z.number().int().optional(),
  targetId: z.string().optional(),
});
const eventSchema = z.object({
  sequence: z.number().int().positive(),
  source: sourceSchema,
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});
/** Original uu/_u/yu. */
export namespace CdpCall {
  export const commandType = "tab_cdp_call";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    method: z.string().min(1),
    params: z.record(z.string(), z.unknown()).optional(),
    target: targetSchema.optional(),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.unknown();
  export function create(payload: {
    browser_id: string;
    tab_id: string;
    method: string;
    params?: Record<string, unknown>;
    target?: { session_id?: string; target_id?: string };
    timeout_ms?: number;
  }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original gu/vu/xu. Server event wait allows zero; caller transport gets a separate timeout. */
export namespace CdpEvents {
  export const commandType = "tab_cdp_events";
  export const PayloadSchema = z.object({
    after_sequence: z.number().int().nonnegative().optional(),
    browser_id: z.string(),
    limit: z.number().int().positive().max(1e3).optional(),
    methods: z.array(z.string().min(1)).min(1).optional(),
    tab_id: z.string(),
    target: targetSchema.optional(),
    timeout_ms: z.number().int().nonnegative().optional(),
  });
  export const ResultSchema = z.object({
    cursor: z.number().int().nonnegative(),
    events: z.array(eventSchema),
    hasMore: z.boolean(),
    truncated: z.boolean(),
  });
  export function create(payload: {
    after_sequence?: number;
    browser_id: string;
    limit?: number;
    methods?: string[];
    tab_id: string;
    target?: { session_id?: string; target_id?: string };
    timeout_ms?: number;
  }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export const TabBotDetectionCommands = { Report: BotDetectionReport };
export const TabCdpCommands = { Call: CdpCall, Events: CdpEvents };

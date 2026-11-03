import { z } from "../vendor/bundled_zod";
import { Command } from "./command";
// Original Pu/Eu/Au/Mu/Ou/$u. The original schemas validate strings, not live locators.
const identifierPattern = /^[A-Za-z0-9_-]{1,48}$/;
const forbiddenIdentifiers = new Set(["__proto__", "constructor", "prototype"]);
const fieldSchema = z.object({
  id: z
    .string()
    .regex(identifierPattern)
    .refine((id: string) => !forbiddenIdentifiers.has(id)),
  label: z.string(),
  type: z.string().min(1),
  autocomplete: z.string().nullable().optional(),
  required: z.boolean(),
  selector: z.string(),
});
const submitSchema = z.object({
  selector: z.string(),
  action: z.enum(["click", "press_enter"]),
});
const optionSchema = z
  .object({
    id: z
      .string()
      .regex(identifierPattern)
      .refine((id: string) => !forbiddenIdentifiers.has(id)),
    label: z.string().trim().min(1).max(120),
    selector: z.string().optional(),
    field_ids: z.array(z.string()).max(6).optional(),
  })
  .refine(
    (option: any) =>
      (option.selector != null) != (option.field_ids?.length ?? 0) > 0,
    "browser auth options require either a selector or credential fields",
  );
const requestSchema = z
  .object({
    origin: z.string(),
    account_identifier: z
      .string()
      .min(1)
      .max(320)
      .refine((account: string) => account.trim().length > 0)
      .optional(),
    fields: z.array(fieldSchema).max(6),
    options: z.array(optionSchema).min(2).max(10).optional(),
    qr_code: z.literal(true).optional(),
    submit: submitSchema.optional(),
    otpHandle: z.string().min(1).max(16384).optional(),
  })
  .refine(
    (request: any) =>
      request.account_identifier == null ||
      (request.fields.length === 1 &&
        request.fields[0]?.type === "password" &&
        request.options == null &&
        request.qr_code == null &&
        request.otpHandle == null),
    "account_identifier is only supported for a password-only sign-in",
  )
  .refine(
    (request: any) =>
      request.fields.length > 0 ||
      request.options != null ||
      request.qr_code === true,
    "browser auth requests require credential fields, sign-in options, or a QR code",
  );
/** Original Ru/Nu/Bu and qu/Du/Lu diagnostics; no host authentication is performed here. */
export namespace BrowserAuthHandoff {
  export const commandType = "tab_browser_auth_handoff";
  export const PayloadSchema = requestSchema.and(
    z.object({ browser_id: z.string(), tab_id: z.string() }),
  );
  export const SubmissionRejectionSchema = z.object({
    outcome: z.enum(["origin_changed", "submission_failed"]),
    reason: z.enum([
      "request_url_invalid",
      "request_scheme",
      "request_origin",
      "paused_iframe",
      "iframe_origin",
      "child_frame_origin",
      "other",
    ]),
    request_class: z.enum(["main_document", "background", "other"]),
    submission_phase: z.enum(["pending", "settled", "not_applicable"]),
  });
  export const SubmissionAttemptEventSchema = z.object({
    sequence: z.number().int().min(0).max(65535),
    kind: z.enum([
      "prompt_completed",
      "field_fill_started",
      "field_fill_completed",
      "field_fill_uncertain",
      "url_changed",
      "document_changed",
      "frame_changed",
      "reinspection_started",
      "reinspection_succeeded",
      "reinspection_failed",
      "site_request",
      "site_navigation",
      "site_submission_verified",
      "submit_started",
      "attempt_completed",
    ]),
    phase: z.enum([
      "prompt",
      "filling",
      "before_submit",
      "submitting",
      "settled",
    ]),
    field_index: z.number().int().min(0).max(63).optional(),
    reinspection: z.number().int().min(1).max(3).optional(),
    outcome: z
      .enum([
        "submitted",
        "unavailable",
        "origin_changed",
        "page_changed",
        "locator_invalid",
        "submission_failed",
        "prompt_changed",
      ])
      .optional(),
    request_class: z.enum(["main_document", "background"]).optional(),
    method: z.enum(["get", "post", "other"]).optional(),
    origin_relation: z.enum(["same", "cross", "other"]).optional(),
  });
  export const SubmissionDiagnosticsSchema = z.object({
    schema_version: z.literal(1),
    request_id: z.string().uuid(),
    submission_mode: z.enum(["ordinary", "private"]),
    first_rejection: SubmissionRejectionSchema.optional(),
    terminal_rejection: SubmissionRejectionSchema.optional(),
    attempt_events: z.array(SubmissionAttemptEventSchema).max(64).optional(),
    dropped_attempt_events: z.number().int().min(0).max(65535).optional(),
  });
  export const ResultSchema = z.object({
    status: z.enum([
      "submitted",
      "declined",
      "cancelled",
      "unavailable",
      "expired",
      "origin_changed",
      "page_changed",
      "locator_invalid",
      "submission_failed",
    ]),
    locator_error: z
      .object({ field_id: z.string(), reason: z.literal("not_user_visible") })
      .optional(),
    selected_option: z.string().optional(),
    reason: z.literal("user_took_over").optional(),
    submission_diagnostics: SubmissionDiagnosticsSchema.optional(),
  });
  export function create(payload: Record<string, unknown>) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
export const TabBrowserAuthCommands = { Handoff: BrowserAuthHandoff };

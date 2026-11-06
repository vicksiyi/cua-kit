import { z } from "../vendor/bundled_zod";
import { Command } from "./command";
export const SiwcTargetSchema = z.discriminatedUnion("kind", [
  z.object({kind:z.literal("ax"),snapshotId:z.string().min(1),elementIndex:z.number().int().nonnegative()}),
  z.object({kind:z.literal("dom"),snapshotId:z.string().min(1),ref:z.string().min(1)}),
]);
export const SiwcCandidateSchema = z.object({
  evidence:z.enum(["siwc_marker_detected","chatgpt_button_detected"]),
  label:z.string().optional(),visibility:z.enum(["rendered","hidden"]),target:SiwcTargetSchema,
});
export const SiwcDetectionSchema = z.discriminatedUnion("status", [
  z.object({status:z.literal("possible_matches"),candidates:z.array(SiwcCandidateSchema).nonempty()}),
  z.object({status:z.literal("no_deterministic_matches"),candidates:z.tuple([])}),
  z.object({status:z.literal("unavailable"),reason:z.enum(["page_changed","observation_unavailable"])}),
]);
export const SiwcAuthenticateOptionsSchema = z.object({target:SiwcTargetSchema.optional()});
export type SiwcAuthenticateOptions = z.infer<typeof SiwcAuthenticateOptionsSchema>;
export namespace SiwcAuthenticate {
  export const commandType = "tab_siwc_authenticate";
  export const PayloadSchema = SiwcAuthenticateOptionsSchema.extend({browser_id:z.string(),tab_id:z.string()});
  export const ResultSchema = z.discriminatedUnion("status", [
    z.object({status:z.enum(["initiated","unsupported","no_actionable_button","target_unavailable","page_changed","account_unavailable","account_changed","approval_declined","approval_cancelled","approval_failed","grant_failed","cookie_failed","click_failed"])}),
    z.object({status:z.literal("multiple_actionable_buttons"),candidates:z.tuple([SiwcCandidateSchema,SiwcCandidateSchema]).rest(SiwcCandidateSchema)}),
  ]);
  export function create(payload:z.infer<typeof PayloadSchema>) {return new Command(commandType,PayloadSchema,payload);}
}
export namespace SiwcDetect {
  export const commandType = "tab_siwc_detect";
  export const PayloadSchema = z.object({browser_id:z.string(),tab_id:z.string()});
  export const ResultSchema = SiwcDetectionSchema;
  export function create(payload:z.infer<typeof PayloadSchema>) {return new Command(commandType,PayloadSchema,payload);}
}

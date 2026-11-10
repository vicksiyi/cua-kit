import type { ElicitRequestParams, ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";

type Handler = (params: ElicitRequestParams) => Promise<ElicitResult>;

/** Caller opt-in only; does not change service/OS access policies. */
export function createAutoApproval(options: {
  enabled: boolean;
  fallback?: Handler;
  signal?: AbortSignal;
  onApproved?: (params: ElicitRequestParams) => void;
}): Handler | undefined {
  if (!options.enabled) return options.fallback;
  return async params => {
    if (options.signal?.aborted) return { action: "cancel" };
    // Consent can be automated; requested user data and URL authentication
    // cannot be invented or completed by accepting an empty object.
    if (params.mode !== "url" && Object.keys(params.requestedSchema.properties).length === 0) {
      const result = new AjvJsonSchemaValidator().getValidator<Record<string, never>>(params.requestedSchema)({});
      if (result.valid) {
        options.onApproved?.(params);
        return { action: "accept", content: result.data };
      }
    }
    return options.fallback ? options.fallback(params) : { action: "cancel" };
  };
}

/** Flags precede the prompt. A delimiter keeps a literal flag inside a prompt. */
export function demoApprovalArguments(args: string[]) {
  let autoApprove = false;
  let index = 0;
  while (args[index] === "--auto-approve") { autoApprove = true; index++; }
  if (args[index] === "--") index++;
  return { autoApprove, args: args.slice(index) };
}

import type { ElicitRequestParams, ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";

type Handler = (params: ElicitRequestParams) => Promise<ElicitResult>;
/** Caller-owned approval policy. Never modifies the server's access or denial policy. */
export function createBrowserOriginApproval(options: {
  origins?: string;
  fallback?: Handler;
  signal?: AbortSignal;
  onApproved?: (origin: string) => void;
}): Handler | undefined {
  if (!options.origins) return options.fallback;
  const all = options.origins === "*";
  const origins = new Set<string>();
  if (!all) {
    for (const entry of options.origins.split(",")) {
      const value = entry.trim();
      let url: URL;
      try { url = new URL(value); } catch { throw Error("CUA_AUTO_APPROVE_BROWSER_ORIGINS must be * or comma-separated HTTP(S) origins"); }
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
        url.search || url.hash || url.pathname !== "/") throw Error("Browser approval entries must be HTTP(S) origins without credentials, paths, queries or fragments");
      origins.add(url.origin);
    }
  }
  return async params => {
    if (options.signal?.aborted) return { action: "cancel" };
    const meta = params._meta;
    const origin = meta?.origin;
    let canonical = false;
    if (typeof origin === "string") {
      try { const url = new URL(origin); canonical = ["http:", "https:"].includes(url.protocol) && url.origin === origin; } catch {}
    }
    const toolParams = meta?.tool_params as Record<string, unknown> | undefined;
    if (params.mode !== "url" && canonical && typeof origin === "string" &&
      meta?.connector_id === "browser-use" && meta.tool_name === "access_browser_origin" &&
      meta.codex_request_type === "approval_request" && toolParams?.origin === origin &&
      Object.keys(params.requestedSchema.properties).length === 0 && (all || origins.has(origin))) {
      const result = new AjvJsonSchemaValidator().getValidator<Record<string, never>>(params.requestedSchema)({});
      if (result.valid) {
        options.onApproved?.(origin);
        return { action: "accept", content: {} };
      }
    }
    return options.fallback ? options.fallback(params) : { action: "cancel" };
  };
}

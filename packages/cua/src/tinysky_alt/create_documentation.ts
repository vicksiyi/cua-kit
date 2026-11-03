import type * as T from "./types";
import type { NodeReplGlobals } from "../types";
export function create_documentation(
  read: T.ReadDocumentation,
): T.Documentation {
  const repl = (globalThis as NodeReplGlobals).nodeRepl;
  const prefix = repl?.env?.TINYSKY_ALT_INITIALIZE_DOCS ?? "core-cua-repl";
  const usesReplDocumentation = prefix === "core-cua-repl";
  return {
    read,
    async read_core(target) {
      const core = await read(`${prefix}-${target}`);
      if (!usesReplDocumentation) return core;
      const confirmations = await readConfirmations();
      return confirmations === "" ? core : `${core}\n${confirmations}`;
    },
    exclude_browser_confirmations: usesReplDocumentation,
  };
  async function readConfirmations(): Promise<string> {
    const current = (globalThis as NodeReplGlobals).nodeRepl;
    const environment = current?.env?.CUA_REPL_BROWSER_ENV;
    if (environment === "orbit") return "";
    const override = confirmationPolicy(current?.requestMeta);
    if (override !== undefined) return override;
    return environment === "training" ? "" : read("confirmations");
  }
}
function confirmationPolicy(
  meta: Record<string, unknown> | undefined,
): string | undefined {
  const candidate = meta?.["openai/confirmation_policies"];
  const policies =
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate)
      ? undefined
      : candidate;
  const value = (policies as { computer_use?: unknown } | undefined)
    ?.computer_use;
  if (
    typeof value === "string" &&
    value.trim() !== "" &&
    new TextEncoder().encode(value).byteLength <= 20000
  )
    return value;
}

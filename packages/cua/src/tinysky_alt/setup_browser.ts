import { bind_tab } from "./bind_tab";
import type { NodeReplGlobals } from "../types";
// Structural factory argument inferred from this original call; full @core/browser types remain pending.
type RuntimeOptions = {
  decorateTab: typeof bind_tab;
  environment: "codex-app" | "training" | "cloud" | "orbit" | undefined;
  undocumentedApiMembers: string[];
  excludedDocumentation: string[];
};
export function setup_browser<Result>(options: {
  setupBrowserRuntime: (options: RuntimeOptions) => Result;
  exclude_browser_confirmations: boolean;
}): Result {
  const repl = (globalThis as NodeReplGlobals).nodeRepl;
  const environment = repl?.env?.CUA_REPL_BROWSER_ENV;
  if (
    environment !== undefined &&
    environment !== "codex-app" &&
    environment !== "training" &&
    environment !== "cloud" &&
    environment !== "orbit"
  )
    throw new Error("Invalid CUA_REPL_BROWSER_ENV");
  const excludedDocumentation = ["tab-claiming-chrome", "tab-mentions-iab"];
  if (options.exclude_browser_confirmations)
    excludedDocumentation.push("confirmations");
  return options.setupBrowserRuntime({
    decorateTab: bind_tab,
    environment,
    undocumentedApiMembers: ["Tab.ax"],
    excludedDocumentation,
  });
}

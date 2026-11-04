import { setupBrowserRuntime } from "@core/browser";
import { sky } from "@core/sky";
import { get_state } from "./get_state";

type BrowserAgentApi = Awaited<ReturnType<typeof setupBrowserRuntime>>;
export const cua: {
  initialize: typeof initialize;
  computer: null | typeof sky;
  browsers: null | BrowserAgentApi["browsers"];
  documentation: null | BrowserAgentApi["documentation"];
} = {
  initialize,
  computer: null,
  browsers: null,
  documentation: null,
};

async function initialize() {
  const runtime = await setupBrowserRuntime({ undocumentedApiMembers: ["Tab.ax"] });
  cua.computer = sky;
  cua.browsers = runtime.browsers;
  cua.documentation = runtime.documentation;
  return get_state({ browsers: runtime.browsers, computer: sky });
}

import type { setupBrowserRuntime } from "@core/browser";
import { get_browsers } from "../get_browsers";
import { create_bootstrap_emitter } from "../tinysky_alt/create_bootstrap_emitter";
import { create_browser_api } from "../tinysky_alt/create_browser_api";
import { create_documentation } from "../tinysky_alt/create_documentation";
import { setup_browser } from "../tinysky_alt/setup_browser";
import type * as T from "../tinysky_alt/types";

/** Original browser-worker entry; host provides its runtime and documentation. */
export async function create_tinysky_browser(options: {
  setup_browser_runtime: typeof setupBrowserRuntime;
  read_documentation: T.ReadDocumentation;
}): Promise<T.TinySkyBrowser> {
  const documentation = create_documentation(options.read_documentation);
  const runtime = await setup_browser({
    setupBrowserRuntime: options.setup_browser_runtime,
    exclude_browser_confirmations: documentation.exclude_browser_confirmations,
  });
  const bootstrap = create_bootstrap_emitter({
    documentation,
    target: "no-cua",
  });
  await bootstrap.emit();
  const browsers = runtime.browsers;
  async function getState(options?: T.ObservationOptions) {
    let state;
    try {
      const result = await get_browsers(browsers);
      state = {
        apps: [],
        browsers: result.browsers,
        ...(result.errors.length > 0 ? { errors: result.errors } : {}),
      };
    } catch (error) {
      state = {
        apps: [],
        browsers: [],
        errors: [`Browsers: ${String(error)}`],
      };
    }
    await bootstrap.emit(state, options);
    return state;
  }
  Reflect.set(globalThis, "agent", runtime);
  return {
    ...create_browser_api(browsers, bootstrap),
    getState,
    initialize: getState,
    rewriteDocumentation: bootstrap.rewrite_documentation,
  };
}

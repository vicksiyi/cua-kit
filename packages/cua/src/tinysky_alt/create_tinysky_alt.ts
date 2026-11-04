import { UnreachableCaseError } from "@core/core/UnreachableCaseError";
import { get_apps } from "../get_apps";
import { get_state } from "../get_state";
import { bind_linux_app } from "./bind_linux_app";
import { bind_mac_app } from "./bind_mac_app";
import { bind_windows_app } from "./bind_windows_app";
import { create_bootstrap_emitter } from "./create_bootstrap_emitter";
import { create_browser_api } from "./create_browser_api";
import { create_documentation } from "./create_documentation";
import { read_documentation } from "./read_documentation";
import { setup_browser } from "./setup_browser";
import type * as T from "./types";

export async function create_tinysky_alt(
  options: T.SetupOptions = {},
): Promise<Omit<T.TinySkyAlt, "initialize">> {
  const documentation = create_documentation(read_documentation);
  const [agent, computer] = await Promise.all([
    setupBrowser({
      browser: options.browser,
      exclude_browser_confirmations:
        documentation.exclude_browser_confirmations,
    }),
    setupComputer(options),
  ]);
  const bootstrap = create_bootstrap_emitter({
    documentation,
    target: computer === undefined ? "no-cua" : computer.target,
  });
  await bootstrap.emit();
  const api: any = {
    rewriteDocumentation: bootstrap.rewrite_documentation,
    async getState(options?: T.ObservationOptions) {
      const state = await get_state({ browsers: agent?.browsers, computer });
      await bootstrap.emit(state, options);
      return state;
    },
  };
  if (agent !== undefined) {
    Reflect.set(globalThis, "agent", agent);
    Object.assign(api, create_browser_api(agent.browsers, bootstrap));
  }
  if (computer !== undefined) {
    Object.assign(api, {
      computer,
      async listApps(options?: T.ObservationOptions) {
        const apps = await get_apps(computer);
        await bootstrap.emit(apps, options);
        return apps;
      },
    });
    const target = computer.target;
    const nativeApi = (() => {
      switch (target) {
        case "mac":
          return {
            async getApp(reference: T.AppReference) {
              if (typeof reference !== "string")
                throw new Error(
                  "macOS getApp requires an app name, path, or bundle ID.",
                );
              const state = await computer.get_app_state({
                app: reference,
                disableDiff: true,
              });
              const app = bind_mac_app(computer, state.app);
              await bootstrap.emit(state.text);
              return app;
            },
          };
        case "linux":
          return {
            async getApp(reference: T.AppReference) {
              const id = windowId(reference, "linux");
              const window = (await computer.list_windows()).find(
                (window: any) => window.id === id,
              );
              if (window === undefined)
                throw new Error(`Window ${id} is unavailable.`);
              const app = bind_linux_app(computer, window);
              const state = await app.getAXState({
                disableDiffing: true,
                emit: false,
              });
              await bootstrap.emit(state);
              return app;
            },
            async listWindows(options?: T.ObservationOptions) {
              const windows = await computer.list_windows();
              await bootstrap.emit(windows, options);
              return windows;
            },
          };
        case "windows":
          return {
            async getApp(reference: T.AppReference) {
              const id = windowId(reference, "windows");
              const window = await computer.get_window({ id });
              const app = bind_windows_app(computer, window);
              const state = await app.getAXState({
                disableDiffing: true,
                emit: false,
              });
              await bootstrap.emit(state);
              return app;
            },
            async listWindows(options?: T.ObservationOptions) {
              const windows = await computer.list_windows();
              await bootstrap.emit(windows, options);
              return windows;
            },
          };
        default:
          throw new UnreachableCaseError(target as never);
      }
    })();
    Object.assign(api, nativeApi);
  }
  return api;
}
function windowId(reference: any, platform: string): number {
  if (
    typeof reference !== "object" ||
    reference === null ||
    !Number.isSafeInteger(reference.windowId) ||
    reference.windowId <= 0
  )
    throw new Error(
      `${platform} getApp requires { windowId } from listApps() or listWindows().`,
    );
  return reference.windowId;
}
async function setupBrowser(options: {
  browser?: boolean;
  exclude_browser_confirmations: boolean;
}): Promise<any> {
  if (options.browser === false) return;
  const { setupBrowserRuntime } = await import("@core/browser");
  return setup_browser({
    setupBrowserRuntime,
    exclude_browser_confirmations: options.exclude_browser_confirmations,
  });
}
async function setupComputer(options: T.SetupOptions): Promise<any> {
  if (options.computer === false) return;
  // Deferred resolution preserves browser-only startup while the native package is separate.
  const packageName = "@core/sky";
  const { sky } = await import(packageName);
  return sky;
}

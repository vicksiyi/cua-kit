import { createTabFaviconManagerClass } from "./tab_favicons";
import { createTabGroupManagerClass } from "./tab_groups";
import { createNetworkPolicyManagerClass } from "./network_policy";
import { createNetworkPolicyEnforcer } from "./network_policy_enforcement";
import { createExtensionInstanceIdReader } from "./instance_id";
import { createTabLeaseManagerClass } from "./tab_leases";
import { createDebuggerRuntime } from "./debugger_runtime";
import { createTabRuntime } from "./tab_runtime";
import {
  createBrowserSessionClass,
  type BrowserSessionDependencies,
} from "./browser_session";
import {
  createBrowserCommandHandlerClass,
  type BrowserCommandDependencies,
} from "./command_handler";

export interface ExtensionBrowserHost {
  chrome: typeof chrome;
  crypto: Pick<Crypto, "randomUUID">;
  now(): number;
  random?(): number;
  fetch?: typeof globalThis.fetch;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
  error(message: string, context: { operation: string }): void;
}
/** Project composition of restored closures; not a replacement for original full dR startup. */
export function createExtensionBrowserFoundation(host: ExtensionBrowserHost) {
  const instanceId = createExtensionInstanceIdReader(host);
  const tabLeases = createTabLeaseManagerClass({ ...host, instanceId });
  const tabFavicons = createTabFaviconManagerClass({
    ...host,
    tabLeases,
    fetch: host.fetch ?? globalThis.fetch,
  });
  const debuggerRuntime = createDebuggerRuntime(host);
  const tabRuntime = createTabRuntime(host);
  const tabGroups = createTabGroupManagerClass({
    chrome: host.chrome,
    random: host.random ?? Math.random,
  });
  const networkPolicy = createNetworkPolicyManagerClass({
    chrome: host.chrome,
    now: host.now,
    enforceActivePage: createNetworkPolicyEnforcer(host),
  });
  const sessionBase = {
    ...debuggerRuntime,
    ...tabRuntime,
    tabGroups,
    tabFavicons,
    chrome: host.chrome,
    tabLeases,
    networkPolicy,
  };
  const handlerBase = {
    favicons: tabFavicons,
    chrome: host.chrome,
    instanceId,
    tabLeases,
    networkPolicy,
    getTab: tabRuntime.getTab,
    initializeDebugger: debuggerRuntime.initializeDebugger,
    setTimeout: host.setTimeout,
    clearTimeout: host.clearTimeout,
  };
  function createHandlerClass(
    handlerDependencies: Omit<
      BrowserCommandDependencies,
      keyof typeof handlerBase | "Session"
    >,
    sessionDependencies: Omit<
      BrowserSessionDependencies,
      keyof typeof sessionBase
    >,
  ) {
    const Session = createBrowserSessionClass({
      ...sessionDependencies,
      ...sessionBase,
    });
    return createBrowserCommandHandlerClass({
      ...handlerDependencies,
      ...handlerBase,
      Session,
    });
  }
  return {
    instanceId,
    tabLeases,
    networkPolicy,
    debuggerRuntime,
    tabRuntime,
    tabGroups,
    tabFavicons,
    createHandlerClass,
  };
}

/** Current XB/YB/JB: feature clients are scoped to caller identity and browser. */
export function createBrowserFeatureClients(host: {
  parent(): {initialized: boolean; user: any} | undefined;
  disabled(runtime: any): boolean;
  createClient(runtime: any, user: any): any;
  reportError(error: unknown): void;
}) {
  const clients = new Map<string, {client: any; ready: Promise<{success: boolean}>; initialized: boolean}>();
  const key = (runtime: any, info: any, user: any) => JSON.stringify([
    user.userID, user.email, info.type, info.family,
    runtime.env.CUA_REPL_BROWSER_ENV ?? "browser",
  ]);
  async function initialize(runtime: any, info: any) {
    const parent = host.parent();
    if (parent == null || !parent.initialized || host.disabled(runtime)) return;
    const id = key(runtime, info, parent.user);
    let state = clients.get(id);
    if (state == null) {
      const client = host.createClient(runtime, {...parent.user, custom: {
        ...parent.user.custom, backend: info.type, browserType: info.type,
        browserFamily: info.family ?? "not_applicable",
        callerVariant: runtime.env.CUA_REPL_BROWSER_ENV ?? "browser",
      }});
      state = {client, ready: client.initializeAsync({timeoutMs: 10000}), initialized: false};
      clients.set(id, state);
    }
    try { state.initialized = (await state.ready).success; }
    catch (error) { host.reportError(error); }
    if (!state.initialized && clients.get(id) === state) {
      clients.delete(id);
      state.client.shutdown().catch(host.reportError);
    }
  }
  function enabled(runtime: any, name: string, info: any) {
    const parent = host.parent();
    if (parent == null || !parent.initialized || host.disabled(runtime)) return false;
    const state = clients.get(key(runtime, info, parent.user));
    return state?.initialized === true && state.client.loadingStatus === "Ready" && state.client.checkGate(name);
  }
  return {initialize, enabled};
}

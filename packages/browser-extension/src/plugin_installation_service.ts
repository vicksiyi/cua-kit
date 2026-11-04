import { ChatApiHttpError, type createChatApiClass } from "./chat_api";
import {
  browserPluginIdentity,
  createBrowserPluginCache,
  ensureBrowserPlugin,
} from "./plugin_installation";
import type { createSiwcServiceClass } from "./siwc";
type AuthReader = ReturnType<
  ReturnType<typeof createSiwcServiceClass>["createCachedAuthReader"]
>;
type Api = InstanceType<ReturnType<typeof createChatApiClass>>;
/** Original rk. Gate/auth transports remain explicit; requests and cache are restored implementations. */
export function createBrowserPluginInstallation(
  host: {
    cache: ReturnType<typeof createBrowserPluginCache>;
    ChatApi: ReturnType<typeof createChatApiClass>;
    createAuthReader(): AuthReader;
    refreshAuth(reader: AuthReader, signal: AbortSignal): Promise<unknown>;
    subscribeGate(
      name: string,
      listener: (
        enabled: boolean,
        status: string,
        userId: string | undefined,
      ) => void,
      signal: AbortSignal,
    ): Promise<unknown>;
    now(): number;
    random(): number;
    setTimeout: typeof globalThis.setTimeout;
    clearTimeout: typeof globalThis.clearTimeout;
    warn(message: string): void;
  },
  onInstalled: () => Promise<unknown>,
) {
  let stopped = false;
  let identity: string | undefined;
  let retries = 0,
    notBefore = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let refreshController: AbortController | undefined;
  let activeApi: Api | undefined;
  let gateController: AbortController | undefined;
  let gatePending: Promise<unknown> | undefined;
  let gateEnabled = false;
  const cache = host.cache;
  function refresh(reader = host.createAuthReader()) {
    if (stopped || host.now() < notBefore) return;
    const previousApi = activeApi;
    refreshController?.abort();
    const controller = new AbortController();
    refreshController = controller;
    void readAndInstall(controller, reader, previousApi);
  }
  async function readAndInstall(
    controller: AbortController,
    reader: AuthReader,
    previousApi: Api | undefined,
  ) {
    try {
      await cache.load();
      controller.signal.throwIfAborted();
      if (activeApi == null && timer == null && retries > 1) retries = 0;
      const auth = await reader(controller.signal);
      controller.signal.throwIfAborted();
      if ("error" in auth && auth.status !== 401 && auth.status !== 403)
        throw auth.error === "http"
          ? new ChatApiHttpError(auth.status, auth.retryAfterMs)
          : Error("Failed to read ChatGPT session.");
      const session = "error" in auth ? null : auth.session;
      const nextIdentity =
        session == null ? undefined : browserPluginIdentity(session.account);
      if (nextIdentity !== identity || session == null) {
        cancelActive();
        gateController?.abort();
        gateController = undefined;
        gatePending = undefined;
        gateEnabled = false;
        if (identity != null || session == null) {
          cache.clear();
          resetRetry();
        }
        identity = nextIdentity;
      }
      if (session == null) return;
      if (cache.isComplete(session.account)) {
        resetRetry();
        return;
      }
      gatePending ??= observeGate(session.account.userId, reader);
      await gatePending;
      controller.signal.throwIfAborted();
      if (
        !gateEnabled ||
        timer != null ||
        host.now() < notBefore ||
        cache.shouldSkip(session.account) ||
        activeApi != null ||
        (previousApi != null &&
          browserPluginIdentity(previousApi.account) === nextIdentity)
      )
        return;
      install(new host.ChatApi(session.accessToken, session.account));
    } catch (error) {
      if (
        stopped ||
        refreshController !== controller ||
        controller.signal.aborted
      )
        return;
      cancelActive();
      handleFailure(error);
    }
  }
  async function observeGate(userId: string, reader: AuthReader) {
    const controller = new AbortController();
    gateController = controller;
    let initial = true;
    try {
      await host.refreshAuth(reader, controller.signal);
      return await host.subscribeGate(
        "chatgpt-work-browser-plugin",
        (enabled, status, currentUserId) => {
          if (stopped || gateController !== controller) return;
          const wasEnabled = gateEnabled;
          gateEnabled =
            status === "Ready" && currentUserId === userId && enabled;
          if (gateEnabled) {
            if (!wasEnabled && !initial && retries <= 1) {
              cache.clearNegative();
              if (host.now() < notBefore)
                schedule(Math.max(2000, notBefore - host.now()));
              else refresh();
            }
          } else {
            cancelActive();
            if (currentUserId === userId) {
              host.clearTimeout(timer);
              timer = undefined;
            }
          }
          if (status === "Ready") initial = false;
        },
        controller.signal,
      );
    } catch (error) {
      if (gateController === controller) {
        controller.abort();
        gateController = undefined;
        gatePending = undefined;
        gateEnabled = false;
      }
      throw error;
    }
  }
  function install(api: Api) {
    activeApi = api;
    ensureBrowserPlugin(api)
      .then((installed) => {
        if (stopped || activeApi !== api) return;
        resetRetry();
        cache.record(api.account, installed);
        if (installed) {
          try {
            onInstalled().catch(() => {});
          } catch {}
        }
      })
      .catch((error) => {
        if (!stopped && activeApi === api) handleFailure(error);
      })
      .finally(() => {
        api.dispose();
        if (activeApi === api) activeApi = undefined;
      });
  }
  function cancelActive() {
    activeApi?.dispose();
    activeApi = undefined;
  }
  function resetRetry() {
    host.clearTimeout(timer);
    timer = undefined;
    retries = 0;
    notBefore = 0;
  }
  function handleFailure(error: unknown) {
    if (stopped) return;
    const retryAfter =
      error instanceof ChatApiHttpError ? (error.retryAfterMs ?? 0) : 0;
    notBefore = Math.max(notBefore, host.now() + retryAfter);
    if (
      error instanceof ChatApiHttpError &&
      (error.retryable === false ||
        ![401, 408, 429, 500, 502, 503, 504].includes(error.status))
    ) {
      host.clearTimeout(timer);
      timer = undefined;
      retries = 2;
      return;
    }
    if (timer == null && retries++ >= 1) {
      host.warn("[browser-plugin] failed to set up Browser");
      return;
    }
    host.clearTimeout(timer);
    timer = undefined;
    schedule(
      Math.max(2000, notBefore - host.now()) + Math.floor(host.random() * 2000),
    );
  }
  function schedule(delay: number) {
    if (delay > 2147483647) return;
    host.clearTimeout(timer);
    timer = host.setTimeout(() => {
      timer = undefined;
      refresh();
    }, delay);
  }
  return {
    refresh,
    stop() {
      stopped = true;
      resetRetry();
      refreshController?.abort();
      gateController?.abort();
      cancelActive();
    },
  };
}

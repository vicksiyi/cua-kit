import { createContentRuntime } from "./content_runtime";
import {
  installForeignFrameMonitor,
  hasForeignFrameMonitor,
  removeForeignFrameMonitor,
} from "./foreign_frame_dom";
interface Lease {
  sessionId: string;
  turnId: string;
  claimedAt: number;
  instanceId: string | null;
}
interface LeaseSource {
  ensureInit(): Promise<void>;
  getActiveLease(tabId: number): Promise<Lease | null | undefined>;
  mightHaveActiveTabLease(tabId: number): boolean;
  getOwningSessionId(tabId: number): Promise<string | null | undefined>;
}
interface Installation {
  leaseKey: string;
  installedDocumentIds: Set<string>;
  pending?: Promise<boolean>;
}
/** Original qy..tS lifecycle; Chrome injects the self-contained DOM functions. */
export function createForeignFrameMonitor(host: {
  chrome: typeof chrome;
  tabLeases: { getInstance(): LeaseSource };
  isInternalUrl(url: string | undefined): boolean;
  contentRuntime: ReturnType<typeof createContentRuntime>;
}) {
  const { chrome } = host,
    withTimeout = host.contentRuntime.withTimeout;
  const key = "__codexForeignExtensionFrameMonitor";
  const tracked = new Set<number>(),
    fallbackInjections = new Map<number, Promise<boolean>>(),
    installations = new Map<number, Installation>(),
    inFlight = new Map<number, Set<Promise<any>>>();
  let initialized = false,
    replacementsInitialized = false;
  function initializeReplacements() {
    if (replacementsInitialized) return;
    replacementsInitialized = true;
    chrome.tabs.onReplaced?.addListener(handleReplaced);
  }
  function initialize() {
    if (initialized) return;
    initialized = true;
    chrome.tabs.onUpdated?.addListener(handleUpdated);
    chrome.tabs.onRemoved?.addListener(handleRemoved);
    chrome.webNavigation?.onCommitted?.addListener((info) =>
      invalidate(info.tabId, info.frameId !== 0),
    );
    chrome.debugger?.onDetach?.addListener((info) => {
      if (info.tabId != null) invalidate(info.tabId);
    });
    initializeReplacements();
    host.tabLeases
      .getInstance()
      .ensureInit()
      .catch(() => {});
  }
  function track(tabId: number) {
    tracked.add(tabId);
  }
  async function leaseKey(tabId: number) {
    const lease = await host.tabLeases.getInstance().getActiveLease(tabId);
    return lease == null
      ? null
      : JSON.stringify([
          lease.sessionId,
          lease.turnId,
          lease.claimedAt,
          lease.instanceId,
        ]);
  }
  function current(tabId: number, state: Installation) {
    return tracked.has(tabId) && installations.get(tabId) === state;
  }
  async function ensure(tabId: number): Promise<boolean> {
    if (!tracked.has(tabId)) return false;
    const lease = await leaseKey(tabId);
    if (lease == null || !tracked.has(tabId)) return false;
    let state = installations.get(tabId);
    if (state?.leaseKey !== lease) {
      state = { leaseKey: lease, installedDocumentIds: new Set() };
      installations.set(tabId, state);
    }
    const installation = state!;
    installation.pending ??= installDocuments(tabId, installation).finally(
      () => {
        delete installation.pending;
      },
    );
    return await installation.pending;
  }
  async function remove(tabId: number) {
    tracked.delete(tabId);
    installations.delete(tabId);
    const pending = fallbackInjections.get(tabId);
    await Promise.allSettled([
      ...(pending == null ? [] : [pending]),
      ...Array.from(inFlight.get(tabId) ?? []),
    ]);
    if (fallbackInjections.get(tabId) === pending)
      fallbackInjections.delete(tabId);
    if (!tracked.has(tabId)) await cleanup(tabId);
  }
  async function installDocuments(
    tabId: number,
    state: Installation,
  ): Promise<boolean> {
    try {
      const frames = await chrome.webNavigation.getAllFrames({ tabId });
      if (!current(tabId, state)) return false;
      if (
        frames == null ||
        !frames.some((frame) => frame.frameId === 0) ||
        frames.some(
          (frame) =>
            !frame.documentId ||
            frame.errorOccurred ||
            frame.documentLifecycle !== "active",
        )
      )
        return await fallback(tabId, state);
      const documents = new Set(frames.map((frame) => frame.documentId));
      for (const document of state.installedDocumentIds)
        if (!documents.has(document))
          state.installedDocumentIds.delete(document);
      const missing = [...documents].filter(
        (document) => !state.installedDocumentIds.has(document),
      );
      if (missing.length > 0) {
        const pending = withTimeout(
          chrome.scripting.executeScript({
            args: [key],
            func: installForeignFrameMonitor,
            injectImmediately: true,
            target: { tabId, documentIds: missing },
          }),
        );
        let requests = inFlight.get(tabId);
        if (requests == null) {
          requests = new Set();
          inFlight.set(tabId, requests);
        }
        requests.add(pending);
        let results;
        try {
          results = await pending;
        } finally {
          requests.delete(pending);
          if (requests.size === 0) inFlight.delete(tabId);
        }
        if (!current(tabId, state)) return false;
        for (const result of results ?? [])
          if (result.result === true && missing.includes(result.documentId))
            state.installedDocumentIds.add(result.documentId);
        if (
          missing.some((document) => !state.installedDocumentIds.has(document))
        )
          return await fallback(tabId, state);
      }
      return (
        (await leaseKey(tabId)) === state.leaseKey && current(tabId, state)
      );
    } catch {
      return await fallback(tabId, state);
    }
  }
  async function fallback(
    tabId: number,
    state: Installation,
  ): Promise<boolean> {
    return current(tabId, state)
      ? (await ensureFallback(tabId)) &&
          (await leaseKey(tabId)) === state.leaseKey &&
          current(tabId, state)
      : false;
  }
  function invalidate(tabId: number, preserveDocuments = false) {
    const state = installations.get(tabId);
    if (state != null)
      installations.set(tabId, {
        leaseKey: state.leaseKey,
        installedDocumentIds: preserveDocuments
          ? new Set(state.installedDocumentIds)
          : new Set(),
      });
  }
  async function ensureFallback(tabId: number): Promise<boolean> {
    if (!tracked.has(tabId)) return false;
    if (await ping(tabId)) return tracked.has(tabId);
    let pending = fallbackInjections.get(tabId);
    if (!pending) {
      pending = injectFallback(tabId);
      fallbackInjections.set(tabId, pending);
      const operation = pending;
      pending.finally(() => {
        if (fallbackInjections.get(tabId) === operation)
          fallbackInjections.delete(tabId);
      });
    }
    return await pending;
  }
  async function ping(tabId: number): Promise<boolean> {
    try {
      return (
        (
          await withTimeout(
            chrome.scripting.executeScript({
              args: ["__codexForeignExtensionFrameMonitor"],
              func: hasForeignFrameMonitor,
              injectImmediately: true,
              target: { allFrames: true, tabId },
            }),
          )
        )?.every((result) => result.result === true) ?? false
      );
    } catch {
      return false;
    }
  }
  async function injectFile(tabId: number): Promise<boolean> {
    try {
      if (
        (await withTimeout(
          chrome.scripting.executeScript({
            files: ["content-scripts/foreign-frame-monitor.js"],
            injectImmediately: true,
            target: { allFrames: true, tabId },
          }),
        )) == null
      )
        return false;
    } catch {
      return false;
    }
    return true;
  }
  async function injectFallback(tabId: number): Promise<boolean> {
    if (!tracked.has(tabId)) return false;
    const installed = await injectFile(tabId);
    if (tracked.has(tabId)) return installed;
    await cleanup(tabId);
    return false;
  }
  function handleUpdated(
    tabId: number,
    change: chrome.tabs.OnUpdatedInfo,
    tab: chrome.tabs.Tab,
  ) {
    if (change.status !== "loading") return;
    invalidate(tabId);
    if (host.isInternalUrl(tab.url)) return;
    const leases = host.tabLeases.getInstance();
    if (tracked.has(tabId) && leases.mightHaveActiveTabLease(tabId))
      leases
        .getOwningSessionId(tabId)
        .then(async (owner) => {
          if (owner != null && tracked.has(tabId)) await ensure(tabId);
        })
        .catch(() => {});
  }
  function handleReplaced(added: number, removed: number) {
    installations.delete(removed);
    installations.delete(added);
    if (tracked.delete(removed)) {
      tracked.add(added);
      fallbackInjections.delete(removed);
    }
  }
  function handleRemoved(tabId: number) {
    tracked.delete(tabId);
    installations.delete(tabId);
    fallbackInjections.delete(tabId);
  }
  async function cleanup(tabId: number) {
    try {
      await withTimeout(
        chrome.scripting.executeScript({
          args: [key],
          func: removeForeignFrameMonitor,
          injectImmediately: true,
          target: { allFrames: true, tabId },
        }),
      );
    } catch {}
  }
  return {
    initialize,
    initializeReplacements,
    track,
    ensure,
    remove,
    invalidate,
    ensureFallback,
    ping,
    injectFile,
    injectFallback,
    handleUpdated,
    handleReplaced,
    handleRemoved,
    cleanup,
  };
}

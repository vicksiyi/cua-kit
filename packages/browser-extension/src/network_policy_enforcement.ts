/** Original JS/XS closure: inspect settled frames before accepting a network policy. */
type Target = { tabId: number; sessionId?: string };
interface InspectionSession {
  target: Target;
  parentSessionId: string | undefined;
  observing: boolean;
  runtimeEnabled: boolean;
  contexts: Map<number, { frameId: string; origin: string }>;
  loadingFrames: Set<string>;
}
interface Inspection {
  tabId: number;
  sessions: Map<string | undefined, InspectionSession>;
  changed: boolean;
  attached: boolean;
  stopped: boolean;
}
interface Frame {
  id: string;
  url: string;
  parentId?: string;
  session: InspectionSession;
  origin: string | undefined;
}
interface Snapshot {
  frames: Frame[];
  canAccessOpener: boolean | undefined;
}
function record(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function timeoutError() {
  return new Error(
    "An error occurred attempting to establish browser-side enforcement of network policy. A document navigation failed to settle within the allotted time.",
  );
}
function createSession(
  target: Target,
  parentSessionId: string | undefined,
): InspectionSession {
  return {
    target,
    parentSessionId,
    observing: false,
    runtimeEnabled: false,
    contexts: new Map(),
    loadingFrames: new Set(),
  };
}
function removeSession(state: Inspection, id: string) {
  state.sessions.delete(id);
  for (const session of state.sessions.values())
    if (
      session.parentSessionId === id &&
      session.target.sessionId !== undefined
    )
      removeSession(state, session.target.sessionId);
}
function onEvent(
  state: Inspection,
  source: Target,
  method: string,
  params: unknown,
) {
  if (source.tabId !== state.tabId) return;
  const session = state.sessions.get(source.sessionId);
  if (!session) return;
  switch (method) {
    case "Target.attachedToTarget":
      if (
        !record(params) ||
        typeof params.sessionId !== "string" ||
        !record(params.targetInfo) ||
        params.targetInfo.type !== "iframe"
      )
        return;
      state.sessions.set(
        params.sessionId,
        createSession(
          { tabId: state.tabId, sessionId: params.sessionId },
          source.sessionId,
        ),
      );
      break;
    case "Target.detachedFromTarget":
      if (!record(params) || typeof params.sessionId !== "string") return;
      removeSession(state, params.sessionId);
      break;
    case "Runtime.executionContextCreated": {
      if (!record(params) || !record(params.context)) return;
      const context = params.context;
      if (
        !record(context.auxData) ||
        context.auxData.isDefault !== true ||
        typeof context.id !== "number" ||
        typeof context.origin !== "string" ||
        typeof context.auxData.frameId !== "string"
      )
        return;
      session.contexts.set(context.id, {
        frameId: context.auxData.frameId,
        origin: context.origin,
      });
      break;
    }
    case "Runtime.executionContextDestroyed":
      if (
        !record(params) ||
        typeof params.executionContextId !== "number" ||
        !session.contexts.delete(params.executionContextId)
      )
        return;
      break;
    case "Runtime.executionContextsCleared":
      session.contexts.clear();
      break;
    case "Page.frameStartedLoading":
      if (record(params) && typeof params.frameId === "string")
        session.loadingFrames.add(params.frameId);
      break;
    case "Page.frameStoppedLoading":
    case "Page.frameDetached":
      if (record(params) && typeof params.frameId === "string")
        session.loadingFrames.delete(params.frameId);
      break;
    case "Page.frameAttached":
    case "Page.frameNavigated":
    case "Page.navigatedWithinDocument":
      break;
    default:
      return;
  }
  state.changed = true;
}
function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return;
  }
}
function frameSource(frame: Frame, frames: Frame[]): URL | undefined {
  const visited = new Set<string>();
  while (frame.url === "about:srcdoc") {
    if (visited.has(frame.id)) return;
    visited.add(frame.id);
    const parent = frames.find((candidate) => candidate.id === frame.parentId);
    if (parent === undefined) return;
    frame = parent;
  }
  const url = parseUrl(frame.url);
  if (url?.protocol === "http:" || url?.protocol === "https:") {
    url.hash = "";
    return url;
  }
  const origin =
    url?.protocol === "blob:"
      ? url.origin
      : frame.url === "about:blank"
        ? frame.origin
        : undefined;
  const source = origin === undefined ? undefined : parseUrl(origin);
  if (
    (source?.protocol === "http:" || source?.protocol === "https:") &&
    source.origin === origin
  )
    return source;
}
function validateFrames(snapshot: Snapshot, allowed: (url: string) => boolean) {
  if (
    snapshot.frames.length === 1 &&
    snapshot.frames[0].url === "about:blank" &&
    snapshot.canAccessOpener === false &&
    (snapshot.frames[0].origin === "null" ||
      snapshot.frames[0].origin === "://")
  )
    return;
  for (const frame of snapshot.frames) {
    const source = frameSource(frame, snapshot.frames);
    if (source === undefined)
      throw new Error(
        `An error occurred attempting to establish browser-side enforcement of network policy. The tab contains a frame whose HTTP(S) source origin could not be established (${parseUrl(frame.url)?.protocol ?? "unknown"} document). No policy violation was established for this frame. With the user's agreement, reloading the tab and retrying attachment may help.`,
      );
    if (!allowed(source.href))
      throw new Error(
        `An error occurred attempting to establish browser-side enforcement of network policy. The tab already contains a frame loaded from an origin outside the current policy: ${source.origin}.`,
      );
  }
}
function contextOrigin(
  session: InspectionSession,
  frameId: string,
): string | undefined {
  let origin: string | undefined;
  for (const context of session.contexts.values())
    if (context.frameId === frameId) {
      if (origin !== undefined) return;
      origin = context.origin;
    }
  return origin;
}
function frameTree(
  value: unknown,
): Array<{ id: string; url: string; parentId: string | undefined }> {
  if (!record(value)) throw new Error("Chromium did not return a frame tree");
  const frames: Array<{
    id: string;
    url: string;
    parentId: string | undefined;
  }> = [];
  function walk(node: unknown) {
    if (
      !record(node) ||
      !record(node.frame) ||
      typeof node.frame.id !== "string" ||
      typeof node.frame.url !== "string"
    )
      throw new Error("Chromium returned an unsupported frame tree");
    frames.push({
      id: node.frame.id,
      url: node.frame.url,
      parentId:
        typeof node.frame.parentId === "string"
          ? node.frame.parentId
          : undefined,
    });
    if (node.childFrames !== undefined) {
      if (!Array.isArray(node.childFrames))
        throw new Error("Chromium returned an unsupported frame tree");
      for (const child of node.childFrames) walk(child);
    }
  }
  walk(value.frameTree);
  return frames;
}
export function createNetworkPolicyEnforcer(host: {
  chrome: typeof chrome;
  now(): number;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
}) {
  function command(
    state: Inspection,
    target: Target,
    method: string,
    params?: object,
  ): Promise<unknown> {
    if (state.stopped)
      throw new Error(
        "Browser Use network policy frame inspection was detached",
      );
    return host.chrome.debugger.sendCommand(target, method, params);
  }
  function detach(state: Inspection): Promise<void> {
    if (!state.attached) return Promise.resolve();
    state.attached = false;
    return host.chrome.debugger.detach({ tabId: state.tabId });
  }
  async function observe(state: Inspection) {
    for (const session of state.sessions.values())
      if (!session.observing) {
        await command(state, session.target, "Page.enable");
        await command(state, session.target, "Target.setAutoAttach", {
          autoAttach: true,
          waitForDebuggerOnStart: false,
          flatten: true,
          filter: [{ type: "iframe", exclude: false }],
        });
        session.observing = true;
      }
  }
  async function snapshot(state: Inspection): Promise<Snapshot | undefined> {
    const tab = await host.chrome.tabs.get(state.tabId);
    if (tab.status !== "complete" || tab.pendingUrl !== undefined) return;
    const frames: Frame[] = [];
    for (const session of state.sessions.values()) {
      const tree = await command(state, session.target, "Page.getFrameTree");
      for (const frame of frameTree(tree)) {
        if (session.loadingFrames.has(frame.id)) return;
        frames.push({ ...frame, session, origin: undefined });
      }
    }
    const after = await host.chrome.tabs.get(state.tabId);
    if (!(after.status !== "complete" || after.pendingUrl !== undefined))
      return { frames, canAccessOpener: undefined };
  }
  async function resolveOrigins(state: Inspection, snapshot: Snapshot) {
    for (const frame of snapshot.frames) {
      if (frame.url !== "about:blank") continue;
      const session = frame.session;
      if (!session.runtimeEnabled) {
        await command(state, session.target, "Runtime.enable");
        session.runtimeEnabled = true;
      }
      frame.origin = contextOrigin(session, frame.id);
    }
    if (
      snapshot.frames.length === 1 &&
      snapshot.frames[0].url === "about:blank"
    ) {
      const info = await command(
        state,
        { tabId: state.tabId },
        "Target.getTargetInfo",
      );
      if (
        record(info) &&
        record(info.targetInfo) &&
        typeof info.targetInfo.canAccessOpener === "boolean"
      )
        snapshot.canAccessOpener = info.targetInfo.canAccessOpener;
    }
  }
  async function inspect(
    state: Inspection,
    deadline: number,
    allowed: (url: string) => boolean,
  ) {
    if (host.now() >= deadline) throw timeoutError();
    await host.chrome.debugger.attach({ tabId: state.tabId }, "1.3");
    state.attached = true;
    try {
      while (host.now() < deadline) {
        state.changed = false;
        try {
          await observe(state);
          const current = await snapshot(state);
          if (current !== undefined && !state.changed) {
            await resolveOrigins(state, current);
            if (!state.changed) {
              if (host.now() >= deadline) throw timeoutError();
              validateFrames(current, allowed);
              if (host.now() >= deadline) throw timeoutError();
              return;
            }
          }
        } catch (error) {
          if (state.stopped || !state.changed) throw error;
        }
        await new Promise<void>((resolve) => host.setTimeout(resolve, 10));
      }
      throw timeoutError();
    } finally {
      await detach(state);
    }
  }
  return async function enforceActivePage(
    tabId: number,
    deadline: number,
    allowed: (url: string) => boolean,
  ): Promise<void> {
    const state: Inspection = {
      tabId,
      sessions: new Map(),
      changed: false,
      attached: false,
      stopped: false,
    };
    state.sessions.set(undefined, createSession({ tabId }, undefined));
    const event = (
      source: chrome.debugger.Debuggee,
      method: string,
      params?: object,
    ) => onEvent(state, source as Target, method, params);
    const detached = (source: chrome.debugger.Debuggee) => {
      if (source.tabId === tabId) {
        state.attached = false;
        state.stopped = true;
      }
    };
    host.chrome.debugger.onEvent.addListener(event);
    host.chrome.debugger.onDetach.addListener(detached);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = host.setTimeout(
        () => reject(timeoutError()),
        Math.max(0, deadline - host.now()),
      );
    });
    try {
      await Promise.race([inspect(state, deadline, allowed), timeout]);
    } finally {
      host.clearTimeout(timer);
      state.stopped = true;
      host.chrome.debugger.onEvent.removeListener(event);
      host.chrome.debugger.onDetach.removeListener(detached);
      detach(state).catch(() => {});
    }
  };
}

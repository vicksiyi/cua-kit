import type { CdpTarget } from "../cdp/dispatch_helpers";
import {
  discoverWebMcpFrames,
  staleWebMcpRegistration,
} from "./frame_discovery";
import { webMcpPageScript } from "./page";

type DiscoveredFrame = Awaited<
  ReturnType<typeof discoverWebMcpFrames>
>["frames"][number];
export interface WebMcpWorld extends DiscoveredFrame {
  generation: number;
  executionContextId: number;
}
export interface WebMcpCdp {
  on(event: string, listener: (...args: any[]) => void): unknown;
  addTabCleanupHandler(listener: (tabId: number) => void): unknown;
  call(
    tabId: number,
    method: string,
    params?: unknown,
    options?: any,
  ): Promise<any>;
  callTarget(
    target: CdpTarget,
    method: string,
    params?: unknown,
    options?: any,
  ): Promise<any>;
  targetForFrameOrAttach(
    tabId: number,
    frameId: string,
    options?: any,
  ): Promise<CdpTarget | null | undefined>;
}
export interface WebMcpTabState {
  generation: number;
  worldName: string;
  frameIds: Set<string>;
  useChromiumCrashWorkaround: boolean;
  worlds: Map<string, WebMcpWorld>;
  registrations: Map<string, WebMcpWorld>;
  observedTargets: Map<string, Promise<void>>;
  notifiedGenerations: Map<string, number>;
  pendingFrameAttachment?: symbol;
  frameSnapshot?: string;
}
const states = new WeakMap<WebMcpCdp, Map<number, WebMcpTabState>>();
let generationCounter = 0;
export const webMcpProbeFrameName =
  "codex-webmcp-probe-97adecab-75be-4770-bbe4-654cac643843";
/** Original Xa. */
export function findWebMcpState(cdp: WebMcpCdp, tabId: number) {
  return states.get(cdp)?.get(tabId);
}
/** Original zi: listeners are installed once per CDP client, not per tab. */
export function ensureWebMcpState(
  cdp: WebMcpCdp,
  tabId: number,
): WebMcpTabState {
  const tabs = states.get(cdp) ?? new Map<number, WebMcpTabState>();
  if (!states.has(cdp)) {
    states.set(cdp, tabs);
    const invalidateTab = (id: number) => {
      const state = tabs.get(id);
      if (state != null) invalidateWebMcpState(state);
    };
    cdp.on("event", (event) => {
      const state = tabs.get(event.source.tabId);
      if (state == null) return;
      const target =
        event.method === "Target.detachedFromTarget"
          ? {
              tabId: event.source.tabId,
              sessionId: event.params.sessionId,
              targetId: event.params.targetId,
            }
          : event.source;
      if (
        [
          "WebMCP.toolsAdded",
          "WebMCP.toolsRemoved",
          "Runtime.executionContextsCleared",
          "Target.detachedFromTarget",
        ].includes(event.method) &&
        [...state.worlds.values()].some((world) =>
          sameWebMcpTarget(world.target, target),
        )
      )
        invalidateTab(event.source.tabId);
      if (
        event.method === "Runtime.executionContextDestroyed" &&
        [...state.worlds.values()].some(
          (world) =>
            sameWebMcpTarget(world.target, event.source) &&
            world.executionContextId === event.params.executionContextId,
        )
      )
        invalidateTab(event.source.tabId);
      if (event.method === "Page.frameAttached") {
        if (state.useChromiumCrashWorkaround)
          state.pendingFrameAttachment = Symbol();
        else invalidateTab(event.source.tabId);
      }
      if (
        (event.method === "Page.frameNavigated" ||
          event.method === "Page.documentOpened") &&
        (!state.useChromiumCrashWorkaround ||
          state.frameIds.has(event.params.frame.id))
      )
        invalidateTab(event.source.tabId);
      if (
        event.method === "Page.frameDetached" &&
        (!state.useChromiumCrashWorkaround ||
          state.frameIds.has(event.params.frameId))
      )
        invalidateTab(event.source.tabId);
      if (event.method === "Target.detachedFromTarget") {
        state.observedTargets.delete(event.params.sessionId);
        if (event.params.targetId != null)
          state.observedTargets.delete(event.params.targetId);
      }
    });
    const cleanup = (id: number) => {
      invalidateTab(id);
      tabs.delete(id);
    };
    cdp.on("tabDetached", cleanup);
    cdp.addTabCleanupHandler(cleanup);
  }
  let state = tabs.get(tabId);
  if (state == null) {
    state = {
      generation: ++generationCounter,
      worldName: `browser-use-webmcp-${crypto.randomUUID()}`,
      frameIds: new Set(),
      useChromiumCrashWorkaround: false,
      worlds: new Map(),
      registrations: new Map(),
      observedTargets: new Map(),
      notifiedGenerations: new Map(),
    };
    tabs.set(tabId, state);
  }
  return state;
}
/** Original nr/pN/Ev/cN. */
export function assertWebMcpGeneration(
  state: WebMcpTabState | undefined,
  generation: number,
) {
  if (state?.generation !== generation)
    throw new Error(staleWebMcpRegistration);
}
export function invalidateWebMcpState(state: WebMcpTabState) {
  state.generation = ++generationCounter;
  state.worlds.clear();
  state.registrations.clear();
}
export function pendingWebMcpTabs(cdp: WebMcpCdp, sessionId: string) {
  return [...(states.get(cdp) ?? [])]
    .filter(
      ([, state]) =>
        state.pendingFrameAttachment != null ||
        state.notifiedGenerations.get(sessionId) !== state.generation,
    )
    .map(([tabId]) => tabId);
}
export function sameWebMcpTarget(target: CdpTarget, eventTarget: CdpTarget) {
  return target.tabId !== eventTarget.tabId
    ? false
    : target.sessionId != null
      ? target.sessionId === eventTarget.sessionId
      : target.targetId != null
        ? target.targetId === eventTarget.targetId
        : eventTarget.sessionId == null && eventTarget.targetId == null;
}
/** Original kh. Observe promises are shared and failures evicted for retry. */
export async function refreshWebMcpFrames(
  cdp: WebMcpCdp,
  tabId: number,
  deadlineMs?: number,
) {
  const state = ensureWebMcpState(cdp, tabId),
    generation = state.generation,
    pending = state.pendingFrameAttachment,
    options = { deadlineMs, preserveDebuggerOnTimeout: true };
  const discovery = await discoverWebMcpFrames(
    { tabId },
    {
      getFrameTree: (target) =>
        cdp.callTarget(target, "Page.getFrameTree", undefined, options),
      getTargets: () =>
        cdp.call(tabId, "Target.getTargets", undefined, options),
      getFrameOwner: (target, frameId) =>
        cdp.callTarget(target, "DOM.getFrameOwner", { frameId }, options),
      async attach(frameId) {
        const target = await cdp.targetForFrameOrAttach(
          tabId,
          frameId,
          options,
        );
        if (target == null) throw new Error(staleWebMcpRegistration);
        return target;
      },
      async observe(target) {
        const key = target.sessionId ?? target.targetId ?? "top";
        let promise = state.observedTargets.get(key);
        if (promise == null) {
          promise = cdp
            .callTarget(target, "WebMCP.enable", undefined, options)
            .then(() => {});
          state.observedTargets.set(key, promise);
        }
        try {
          await promise;
        } catch (error) {
          state.observedTargets.delete(key);
          throw error;
        }
      },
    },
    state.useChromiumCrashWorkaround ? webMcpProbeFrameName : undefined,
  );
  assertWebMcpGeneration(state, generation);
  if (state.frameSnapshot != null && state.frameSnapshot !== discovery.snapshot)
    invalidateWebMcpState(state);
  state.frameSnapshot = discovery.snapshot;
  state.frameIds = new Set(discovery.frames.map((frame) => frame.frameId));
  if (state.pendingFrameAttachment === pending)
    state.pendingFrameAttachment = undefined;
  return { frames: discovery.frames, pageUrl: discovery.pageUrl };
}
/** Original mN. Origin authorization is memoized within this fetch only. */
export async function fetchWebMcpTools(
  cdp: WebMcpCdp,
  tabId: number,
  pageUrl: string,
  authorizeOrigin: (origin: string) => Promise<boolean>,
  useChromiumCrashWorkaround: boolean,
  deadlineMs?: number,
) {
  const state = ensureWebMcpState(cdp, tabId);
  state.useChromiumCrashWorkaround = useChromiumCrashWorkaround;
  const discovery = await refreshWebMcpFrames(cdp, tabId, deadlineMs);
  if (discovery.pageUrl !== pageUrl) throw new Error(staleWebMcpRegistration);
  const generation = state.generation,
    permissions = new Map<string, Promise<boolean>>();
  const tools = (
    await Promise.all(
      discovery.frames.map(async (frame) => {
        const origin = frame.fileUrl ?? frame.origin;
        let permission = permissions.get(origin);
        if (permission == null) {
          permission = authorizeOrigin(origin);
          permissions.set(origin, permission);
        }
        if (!(await permission)) return [];
        const world = await ensureWebMcpWorld(cdp, frame, deadlineMs);
        const result = await evaluateWebMcpWorld(
          cdp,
          world,
          `${webMcpPageScript()}\nwebMcp.readTools(${JSON.stringify({ frameUrl: frame.url, generation, pageUrl, staleRegistrationError: staleWebMcpRegistration, useChromiumCrashWorkaround })})`,
          { timeoutMs: 10000, deadlineMs, preserveDebuggerOnTimeout: true },
        );
        assertWebMcpGeneration(state, generation);
        if (!Array.isArray(result))
          throw new Error("WebMCP fetchTools failed: no result returned.");
        for (const tool of result) {
          if (
            typeof tool?.registration_id !== "string" ||
            tool.origin !== frame.origin
          )
            throw new Error("Invalid native WebMCP tool owner.");
          state.registrations.set(tool.registration_id, world);
          if (frame.fileUrl != null) tool.origin = frame.fileUrl;
        }
        return result;
      }),
    )
  ).flat();
  if ((await refreshWebMcpFrames(cdp, tabId, deadlineMs)).pageUrl !== pageUrl)
    throw new Error(staleWebMcpRegistration);
  assertWebMcpGeneration(state, generation);
  return { generation, tools };
}
/** Original fN. */
export async function invokeWebMcpTool(
  cdp: WebMcpCdp,
  tabId: number,
  registrationId: string,
  input: unknown,
  timeoutMs?: number,
) {
  const state = ensureWebMcpState(cdp, tabId),
    world = state.registrations.get(registrationId);
  if (world == null) throw new Error(staleWebMcpRegistration);
  await refreshWebMcpFrames(cdp, tabId);
  assertWebMcpGeneration(state, world.generation);
  return await evaluateWebMcpWorld(
    cdp,
    world,
    `${webMcpPageScript()}\nwebMcp.invokeTool(${JSON.stringify({ registrationId, generation: world.generation, inputJson: JSON.stringify(input ?? null), timeoutMs, staleRegistrationError: staleWebMcpRegistration })})`,
    { timeoutMs },
  );
}
/** Original bte. */
export async function ensureWebMcpWorld(
  cdp: WebMcpCdp,
  frame: DiscoveredFrame,
  deadlineMs?: number,
) {
  const state = ensureWebMcpState(cdp, frame.target.tabId),
    generation = state.generation,
    cached = state.worlds.get(frame.frameId);
  if (cached != null) return cached;
  const { executionContextId } = await cdp.callTarget(
    frame.target,
    "Page.createIsolatedWorld",
    {
      frameId: frame.frameId,
      grantUniveralAccess: false,
      worldName: state.worldName,
    },
    { deadlineMs, preserveDebuggerOnTimeout: true },
  );
  assertWebMcpGeneration(state, generation);
  const world = { ...frame, generation, executionContextId };
  state.worlds.set(frame.frameId, world);
  return world;
}
/** Original hN: dispatch-time generation check also guards queued CDP requests. */
export async function evaluateWebMcpWorld(
  cdp: WebMcpCdp,
  world: WebMcpWorld,
  expression: string,
  options: {
    timeoutMs?: number;
    deadlineMs?: number;
    preserveDebuggerOnTimeout?: boolean;
  },
) {
  const response = await cdp.callTarget(
    world.target,
    "Runtime.evaluate",
    {
      awaitPromise: true,
      contextId: world.executionContextId,
      expression,
      returnByValue: true,
      timeout: options.timeoutMs,
    },
    {
      ...options,
      beforeDispatch: () =>
        assertWebMcpGeneration(
          findWebMcpState(cdp, world.target.tabId),
          world.generation,
        ),
    },
  );
  if (response.exceptionDetails != null)
    throw new Error(
      response.exceptionDetails.exception?.description ??
        response.exceptionDetails.text,
    );
  return response.result.value;
}

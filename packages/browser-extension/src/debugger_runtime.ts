export interface CdpCommandRequest {
  target: chrome.debugger.Debuggee;
  method: string;
  commandParams?: object;
  timeoutMs?: number;
}
export class CdpCommandTimeoutError extends Error {
  constructor(method: string, timeoutMs: number) {
    super(`Timed out after ${timeoutMs}ms waiting for CDP command ${method}.`);
    this.name = "CdpCommandTimeoutError";
  }
}
export function isCdpTimeout(error: unknown): error is CdpCommandTimeoutError {
  return error instanceof CdpCommandTimeoutError;
}
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message;
    if (typeof message === "string") return message;
  }
  return String(error ?? "");
}
/** Original gE. The installed attach path calls this with undefined (no default viewport). */
export function parseViewportSize(value: unknown) {
  if (typeof value !== "string") return null;
  const match = /^(?<width>[1-9]\d*)x(?<height>[1-9]\d*)$/u.exec(value);
  return match?.groups == null
    ? null
    : {
        width: Number.parseInt(match.groups.width, 10),
        height: Number.parseInt(match.groups.height, 10),
      };
}
/** Original debugger closure: fE/yd/mE/Sd/Ed/Td/_E/yi/kd/Va/Pd and supporting state. */
export function createDebuggerRuntime(host: {
  chrome: Pick<typeof chrome, "debugger">;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
}) {
  const attachedTabs = new Set<number>(),
    attachedTargets = new Set<string>(),
    targetOwners = new Map<string, number>();
  const tabOperations = new Map<number, Promise<unknown>>(),
    targetOperations = new Map<string, Promise<unknown>>();
  let initialized = false;
  function initializeDebugger() {
    if (initialized) return;
    host.chrome.debugger.onDetach.addListener((source) => {
      if (typeof source.tabId === "number") attachedTabs.delete(source.tabId);
      if (typeof source.targetId === "string") {
        attachedTargets.delete(source.targetId);
        targetOwners.delete(source.targetId);
      }
    });
    initialized = true;
  }
  async function runOperation<Key, Result>(
    queues: Map<Key, Promise<unknown>>,
    key: Key,
    operation: () => Promise<Result>,
  ) {
    const previous = queues.get(key) ?? Promise.resolve();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = previous.catch(() => {}).then(() => gate);
    queues.set(key, pending);
    try {
      await previous.catch(() => {});
      return await operation();
    } finally {
      release();
      if (queues.get(key) === pending) queues.delete(key);
    }
  }
  const runTabOperation = <T>(id: number, operation: () => Promise<T>) =>
    runOperation(tabOperations, id, operation);
  const runTargetOperation = <T>(id: string, operation: () => Promise<T>) =>
    runOperation(targetOperations, id, operation);
  function sendCdpRaw(request: CdpCommandRequest): Promise<any> {
    if (request.method === "Target.getTargets")
      return host.chrome.debugger
        .getTargets()
        .then((targets) => ({
          targetInfos: targets.map((target) => ({
            ...target,
            targetId: target.id,
          })),
        }));
    const target =
      typeof request.target.targetId === "string"
        ? { targetId: request.target.targetId }
        : request.target;
    return host.chrome.debugger.sendCommand(
      target,
      request.method,
      request.commandParams,
    );
  }
  async function sendCdp(request: CdpCommandRequest) {
    const timeout =
      typeof request.timeoutMs === "number" &&
      Number.isFinite(request.timeoutMs) &&
      request.timeoutMs > 0
        ? request.timeoutMs
        : 10000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_resolve, reject) => {
      timer = host.setTimeout(
        () => reject(new CdpCommandTimeoutError(request.method, timeout)),
        timeout,
      );
    });
    try {
      return await Promise.race([sendCdpRaw(request), expired]);
    } finally {
      if (timer !== undefined) host.clearTimeout(timer);
    }
  }
  async function setViewport(
    tabId: number,
    viewport: { width: number; height: number } | null | undefined,
  ) {
    const size = viewport ?? parseViewportSize(undefined);
    if (size == null) {
      if (viewport === undefined) return;
      await sendCdpRaw({
        target: { tabId },
        method: "Emulation.clearDeviceMetricsOverride",
        commandParams: {},
      });
      return;
    }
    await sendCdpRaw({
      target: { tabId },
      method: "Emulation.setDeviceMetricsOverride",
      commandParams: { ...size, deviceScaleFactor: 1, mobile: false },
    });
  }
  async function attachDebugger(
    tabId: number,
    viewport?: { width: number; height: number } | null,
  ) {
    await runTabOperation(tabId, async () => {
      if (attachedTabs.has(tabId)) {
        if (viewport !== undefined) await setViewport(tabId, viewport);
        return;
      }
      try {
        await host.chrome.debugger.attach({ tabId }, "1.3");
      } catch (error) {
        if (!errorMessage(error).includes("Another debugger")) throw error;
      }
      await setViewport(tabId, viewport);
      attachedTabs.add(tabId);
    });
  }
  async function attachDebuggerTarget(tabId: number, targetId: string) {
    await runTargetOperation(targetId, async () => {
      if (attachedTargets.has(targetId)) return;
      try {
        await host.chrome.debugger.attach({ targetId }, "1.3");
      } catch (error) {
        if (!errorMessage(error).includes("Another debugger")) throw error;
      }
      attachedTargets.add(targetId);
      targetOwners.set(targetId, tabId);
    });
  }
  async function detachDebugger(tabId: number) {
    await runTabOperation(tabId, async () => {
      try {
        await host.chrome.debugger.detach({ tabId });
      } finally {
        attachedTabs.delete(tabId);
      }
    });
  }
  async function detachDebuggerTarget(targetId: string) {
    await runTargetOperation(targetId, async () => {
      try {
        await host.chrome.debugger.detach({ targetId });
      } finally {
        attachedTargets.delete(targetId);
        targetOwners.delete(targetId);
      }
    });
  }
  async function detachAfterTimeout(tabId: number) {
    await runTabOperation(tabId, async () => {
      attachedTabs.delete(tabId);
      try {
        await host.chrome.debugger.detach({ tabId });
      } catch {}
    });
  }
  return {
    attachedTabs,
    attachedTargets,
    targetOwners,
    tabOperations,
    targetOperations,
    initializeDebugger,
    runTabOperation,
    runTargetOperation,
    sendCdpRaw,
    sendCdp,
    setViewport,
    attachDebugger,
    attachDebuggerTarget,
    detachDebugger,
    detachDebuggerTarget,
    detachAfterTimeout,
    isCdpTimeout,
  };
}

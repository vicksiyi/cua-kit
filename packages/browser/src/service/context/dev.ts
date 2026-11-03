import type { CdpDispatchOptions } from "../cdp/execute_methods";
import type { FrameEvent } from "../cdp/frame_methods";
export interface ConsoleLog {
  level: "debug" | "info" | "warn" | "error" | "log";
  message: string;
  timestamp: string;
  url?: string;
}
export interface DevCdp {
  addTabAttachHandler(
    handler: (
      tabId: number,
      options: CdpDispatchOptions,
    ) => Promise<void> | undefined,
  ): unknown;
  on(event: string, handler: (...args: any[]) => void): unknown;
  call(
    tabId: number,
    method: string,
    params: undefined,
    options: CdpDispatchOptions,
  ): Promise<unknown>;
  hasBrowserAuthRawEventProtection(tabId: number): boolean;
}
/** Original dg and console conversion helpers. Runtime-enable races are preserved. */
export class BrowserDev {
  cdp: DevCdp;
  logsByTabId = new Map<number, ConsoleLog[]>();
  runtimeEnabledTabIds = new Set<number>();
  runtimeEnablePromises = new Map<number, Promise<void>>();
  constructor(cdp: DevCdp) {
    this.cdp = cdp;
    this.cdp.addTabAttachHandler((tabId, options) => {
      if (!this.runtimeEnablePromises.has(tabId))
        return this.ensureRuntimeEnabled(tabId, options);
    });
    this.cdp.on("tabDetached", (tabId) => {
      this.logsByTabId.delete(tabId);
      this.runtimeEnabledTabIds.delete(tabId);
      this.runtimeEnablePromises.delete(tabId);
    });
    this.cdp.on("event", (event) => {
      this.handleCdpEvent(event);
    });
  }
  async logs({
    tabId,
    filter,
    levels,
    limit = 100,
  }: {
    tabId: number;
    filter?: string;
    levels?: string[];
    limit?: number;
  }) {
    await this.ensureRuntimeEnabled(tabId);
    const accepted = levels ? new Set(levels) : null;
    return (this.logsByTabId.get(tabId) ?? [])
      .filter(
        (log) =>
          !(
            (filter && !log.message.includes(filter)) ||
            (accepted && !accepted.has(log.level))
          ),
      )
      .slice(-limit);
  }
  async ensureRuntimeEnabled(tabId: number, options: CdpDispatchOptions = {}) {
    if (this.runtimeEnabledTabIds.has(tabId)) return;
    const existing = this.runtimeEnablePromises.get(tabId);
    if (existing) {
      await existing;
      return;
    }
    const pending = (async () => {
      await this.cdp.call(tabId, "Runtime.enable", undefined, options);
      this.runtimeEnabledTabIds.add(tabId);
    })();
    this.runtimeEnablePromises.set(tabId, pending);
    try {
      await pending;
    } finally {
      this.runtimeEnablePromises.delete(tabId);
    }
  }
  handleCdpEvent(event: FrameEvent) {
    const tabId = event.source.tabId;
    if (
      typeof tabId !== "number" ||
      this.cdp.hasBrowserAuthRawEventProtection(tabId)
    )
      return;
    if (event.method === "Runtime.consoleAPICalled") {
      const log = consoleEventLog(event.params);
      if (log) this.pushLog(tabId, log);
      return;
    }
    if (event.method === "Runtime.exceptionThrown") {
      const log = exceptionEventLog(event.params);
      if (log) this.pushLog(tabId, log);
    }
  }
  pushLog(tabId: number, log: ConsoleLog) {
    const logs = this.logsByTabId.get(tabId) ?? [];
    logs.push(log);
    if (logs.length > 500) logs.splice(0, logs.length - 500);
    this.logsByTabId.set(tabId, logs);
  }
}
function isObject(value: any): value is Record<string, any> {
  return typeof value === "object" && value != null;
}
function stringField(value: Record<string, any>, key: string) {
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}
function urlField(url?: string) {
  return url ? { url } : {};
}
function logLevel(type?: string): ConsoleLog["level"] {
  switch (type) {
    case "debug":
      return "debug";
    case "info":
      return "info";
    case "warning":
    case "warn":
      return "warn";
    case "error":
      return "error";
    default:
      return "log";
  }
}
export function consoleArguments(args: any) {
  return !Array.isArray(args) || args.length === 0
    ? ""
    : args
        .map((arg) =>
          isObject(arg)
            ? arg.type === "string"
              ? String(arg.value ?? "")
              : arg.value !== undefined
                ? String(arg.value)
                : typeof arg.description === "string"
                  ? arg.description
                  : "[object]"
            : "[object]",
        )
        .join(" ");
}
function stackUrl(stack: any) {
  if (!isObject(stack) || !Array.isArray(stack.callFrames)) return {};
  const [frame] = stack.callFrames;
  return isObject(frame) ? urlField(stringField(frame, "url")) : {};
}
export function consoleEventLog(params: any): ConsoleLog | null {
  return isObject(params)
    ? {
        level: logLevel(stringField(params, "type")),
        message: consoleArguments(params.args),
        timestamp: new Date().toISOString(),
        ...stackUrl(params.stackTrace),
      }
    : null;
}
function exceptionMessage(
  details: Record<string, any>,
  exception: Record<string, any> | null,
) {
  const value = exception?.value;
  return typeof value === "string"
    ? value
    : (stringField(exception ?? {}, "description") ??
        stringField(details, "text") ??
        "Uncaught exception");
}
export function exceptionEventLog(params: any): ConsoleLog | null {
  if (!isObject(params) || !isObject(params.exceptionDetails)) return null;
  const exception = isObject(params.exceptionDetails.exception)
    ? params.exceptionDetails.exception
    : null;
  return {
    level: "error",
    message: exceptionMessage(params.exceptionDetails, exception),
    timestamp: new Date().toISOString(),
    ...urlField(stringField(params.exceptionDetails, "url")),
  };
}

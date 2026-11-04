/** Restored from extension background.js GE; Chrome owns the native messaging transport. */
export class NativeHostRequestError extends Error {
  errorType: string | undefined;
  constructor(message: string, data: unknown) {
    super(message);
    this.name = "NativeHostRequestError";
    this.errorType = nativeHostErrorType(data);
  }
}
export class NativeHostRequestTimeoutError extends Error {
  constructor(
    public method: string,
    public timeoutMs: number,
  ) {
    super(`Native host request ${method} timed out after ${timeoutMs}ms`);
    this.name = "NativeHostRequestTimeoutError";
  }
}
export class NativeTransportConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NativeTransportConnectionError";
  }
}
export function nativeHostErrorType(data: unknown): string | undefined {
  if (data == null || typeof data !== "object" || !("type" in data)) return;
  return typeof data.type === "string" ? data.type : undefined;
}
export interface NativeTransportStatus {
  state: string;
  hostName: string;
  lastChecked: number;
  reconnectAttempt: number;
  error?: string;
  errorType?: string;
  nextRetryMs?: number;
}
export interface NativeTransportDependencies {
  chrome: Pick<typeof chrome, "runtime" | "alarms">;
  now(): number;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
}
/** Dependency boundary for differential tests; production delegates to Chrome and standard timers. */
export function createNativeTransportClass(host: NativeTransportDependencies) {
  return class NativeTransport {
    port: chrome.runtime.Port | null = null;
    messageCallback: ((message: any) => void) | null = null;
    nextHostRequestId = 0;
    pendingHostRequests = new Map<
      string,
      {
        timeoutId?: ReturnType<typeof setTimeout>;
        reject(error: unknown): void;
        resolve(value: unknown): void;
      }
    >();
    applicationCandidates: string[];
    applicationIndex = 0;
    failedApplications = new Set<string>();
    reconnectAlarmName: string;
    reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
    reconnectPending = false;
    reconnectAttempt = 0;
    status: NativeTransportStatus;
    handleReconnectAlarm = (alarm: chrome.alarms.Alarm) => {
      if (alarm.name === this.reconnectAlarmName) {
        if (this.port) {
          this.clearReconnectAlarm();
          return;
        }
        this.runReconnectAttempt();
      }
    };
    constructor(application: string | string[] = "com.openai.codexextension") {
      this.applicationCandidates =
        typeof application === "string"
          ? [application]
          : [application[0], ...application.slice(1)];
      this.reconnectAlarmName = `native-transport-reconnect:${this.application}`;
      this.status = {
        state: "disconnected",
        hostName: this.application,
        lastChecked: host.now(),
        reconnectAttempt: this.reconnectAttempt,
      };
      host.chrome.alarms.onAlarm.addListener(this.handleReconnectAlarm);
      if (!this.connect()) this.scheduleReconnect();
    }
    sendMessage(message: unknown) {
      if (!this.port) {
        this.scheduleReconnect();
        throw new NativeTransportConnectionError(
          "Native transport is disconnected; reconnect is pending",
        );
      }
      this.port.postMessage(message);
    }
    requestHost(
      method: string,
      params?: unknown,
      options: { timeoutMs?: number } = {},
    ): Promise<unknown> {
      const port = this.port;
      if (!port) {
        this.scheduleReconnect();
        return Promise.reject(
          new NativeTransportConnectionError(
            "Native transport is disconnected; reconnect is pending",
          ),
        );
      }
      const id = this.createHostRequestId();
      const message = {
        jsonrpc: "2.0",
        id,
        method,
        ...(params === undefined ? {} : { params }),
      };
      return new Promise((resolve, reject) => {
        const timeoutMs = options.timeoutMs;
        const timeoutId =
          timeoutMs == null
            ? undefined
            : host.setTimeout(() => {
                this.takePendingHostRequest(id)?.reject(
                  new NativeHostRequestTimeoutError(method, timeoutMs),
                );
              }, timeoutMs);
        this.pendingHostRequests.set(id, {
          ...(timeoutId == null ? {} : { timeoutId }),
          reject,
          resolve,
        });
        try {
          port.postMessage(message);
        } catch (error) {
          this.takePendingHostRequest(id);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    }
    setMessageCallback(callback: ((message: any) => void) | null) {
      this.messageCallback = callback;
    }
    getStatus() {
      return { ...this.status };
    }
    refreshStatus() {
      this.updateStatus(this.port ? "connected" : this.status.state, {
        error: this.status.error,
        nextRetryMs: this.status.nextRetryMs,
      });
      return this.getStatus();
    }
    reconnectNow(error?: string) {
      const port = this.port;
      if (port != null) {
        this.port = null;
        this.rejectPendingHostRequests(
          new NativeTransportConnectionError(
            "Native transport reconnect requested",
          ),
        );
        try {
          port.disconnect();
        } catch {}
      }
      this.clearReconnectTimeout();
      this.clearReconnectAlarm();
      this.updateStatus("reconnecting", {
        ...(error == null ? {} : { error }),
        nextRetryMs: 5000,
      });
      this.runReconnectAttempt();
    }
    connect(options: { failureState?: string } = {}) {
      if (this.port) return true;
      let port: chrome.runtime.Port;
      for (;;) {
        try {
          port = host.chrome.runtime.connectNative(this.application);
          break;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          const state = options.failureState ?? "disconnected";
          this.updateStatus(state, {
            error: message,
            ...(state === "reconnecting" ? { nextRetryMs: 5000 } : {}),
          });
          if (!this.selectFallbackApplication(message)) return false;
        }
      }
      this.port = port;
      this.reconnectPending = false;
      this.reconnectAttempt = 0;
      this.clearReconnectTimeout();
      this.clearReconnectAlarm();
      this.updateStatus("connected");
      port.onMessage.addListener((message) => {
        if (this.port === port) {
          this.failedApplications.clear();
          if (!this.handleHostResponse(message))
            this.messageCallback?.(message);
        }
      });
      port.onDisconnect.addListener(() => {
        if (this.port !== port) return;
        this.port = null;
        this.rejectPendingHostRequests(
          new NativeTransportConnectionError("Native transport disconnected"),
        );
        const error = host.chrome.runtime.lastError?.message;
        this.updateStatus("disconnected", { error });
        if (!(
          this.selectFallbackApplication(error) &&
          this.connect({ failureState: "reconnecting" })
        ))
          this.scheduleReconnect();
      });
      return true;
    }
    createHostRequestId() {
      return `native-host:${++this.nextHostRequestId}`;
    }
    handleHostResponse(message: any): boolean {
      if (!("id" in message)) return false;
      const id = String(message.id);
      const pending = this.takePendingHostRequest(id);
      if (pending) {
        if ("error" in message)
          pending.reject(
            new NativeHostRequestError(
              message.error.message,
              message.error.data,
            ),
          );
        else if ("result" in message) pending.resolve(message.result);
        else
          pending.reject(new Error("Native host returned an invalid response"));
        return true;
      }
      return (
        /^native-host:\d+$/.test(id) &&
        ("error" in message || "result" in message)
      );
    }
    rejectPendingHostRequests(error: unknown) {
      for (const id of this.pendingHostRequests.keys())
        this.takePendingHostRequest(id)?.reject(error);
    }
    takePendingHostRequest(id: string) {
      const pending = this.pendingHostRequests.get(id);
      this.pendingHostRequests.delete(id);
      if (pending?.timeoutId != null) host.clearTimeout(pending.timeoutId);
      return pending;
    }
    scheduleReconnect() {
      if (this.port) return;
      if (!this.reconnectPending) {
        this.reconnectPending = true;
        this.reconnectAttempt++;
      }
      this.scheduleReconnectRetry();
      this.updateStatus("reconnecting", {
        error: this.status.error,
        nextRetryMs: 5000,
      });
    }
    scheduleReconnectTimeout() {
      if (this.port || this.reconnectTimeoutId != null) return;
      this.reconnectTimeoutId = host.setTimeout(() => {
        this.reconnectTimeoutId = null;
        this.runReconnectAttempt();
      }, 5000);
    }
    clearReconnectTimeout() {
      if (this.reconnectTimeoutId != null) {
        host.clearTimeout(this.reconnectTimeoutId);
        this.reconnectTimeoutId = null;
      }
    }
    scheduleReconnectRetry() {
      this.scheduleReconnectTimeout();
      this.scheduleReconnectAlarm();
    }
    runReconnectAttempt() {
      if (this.port) return;
      this.clearReconnectTimeout();
      this.reconnectPending = true;
      this.reconnectAttempt++;
      if (!this.connect({ failureState: "reconnecting" }))
        this.scheduleReconnectRetry();
    }
    async ensureReconnectAlarm() {
      if (this.port) return;
      const alarm = await host.chrome.alarms.get(this.reconnectAlarmName);
      if (!this.port && !alarm)
        await host.chrome.alarms.create(this.reconnectAlarmName, {
          periodInMinutes: 0.5,
        });
    }
    clearReconnectAlarm() {
      host.chrome.alarms.clear(this.reconnectAlarmName).catch(() => {});
    }
    scheduleReconnectAlarm() {
      this.ensureReconnectAlarm().catch((error) => {
        if (this.port) return;
        this.reconnectPending = false;
        this.updateStatus("disconnected", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
    updateStatus(
      state: string,
      options: { error?: string; nextRetryMs?: number } = {},
    ) {
      this.status = {
        state,
        hostName: this.application,
        lastChecked: host.now(),
        reconnectAttempt: this.reconnectAttempt,
        ...(options.error ? { error: options.error } : {}),
        ...(options.error === "Specified native messaging host not found."
          ? { errorType: "host_not_found" }
          : {}),
        ...(options.nextRetryMs ? { nextRetryMs: options.nextRetryMs } : {}),
      };
    }
    selectFallbackApplication(error?: string) {
      if (
        error !== "Specified native messaging host not found." ||
        this.applicationCandidates.length === 1
      )
        return false;
      this.failedApplications.add(this.application);
      const index = this.applicationCandidates.findIndex(
        (name) => !this.failedApplications.has(name),
      );
      if (index === -1) {
        this.failedApplications.clear();
        this.applicationIndex = 0;
        return false;
      }
      this.applicationIndex = index;
      return true;
    }
    get application() {
      return (
        this.applicationCandidates[this.applicationIndex] ??
        this.applicationCandidates[0]
      );
    }
  };
}
export const NativeTransport = createNativeTransportClass({
  get chrome() {
    return chrome;
  },
  now: () => Date.now(),
  get setTimeout() {
    return setTimeout;
  },
  get clearTimeout() {
    return clearTimeout;
  },
});

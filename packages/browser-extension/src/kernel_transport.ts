export interface KernelTransport {
  sendMessage(message: any): void;
  setMessageCallback(callback: (message: any) => void): void;
  addCloseListener?(listener: (error?: Error) => unknown): () => void;
  close?(): Promise<void>;
}
/** Original Gg; retain synchronous listener exceptions and asynchronous rejection handling. */
export function createKernelPortTransportClass(
  runtime: Pick<typeof chrome.runtime, "lastError">,
) {
  return class KernelPortTransport implements KernelTransport {
    closeListeners = new Set<(error?: Error) => unknown>();
    closed = false;
    messageCallback?: (message: any) => void;
    constructor(public port: chrome.runtime.Port) {
      port.onMessage.addListener((message) => this.messageCallback?.(message));
      port.onDisconnect.addListener(() => {
        const message = runtime.lastError?.message;
        this.finish(message == null ? undefined : new Error(message));
      });
    }
    sendMessage(message: any) {
      if (this.closed)
        throw new Error("JavaScript kernel browser transport is closed");
      this.port.postMessage(message);
    }
    setMessageCallback(callback: (message: any) => void) {
      this.messageCallback = callback;
    }
    addCloseListener(listener: (error?: Error) => unknown) {
      this.closeListeners.add(listener);
      return () => {
        this.closeListeners.delete(listener);
      };
    }
    async close() {
      if (!this.closed) {
        this.port.disconnect();
        this.finish();
      }
    }
    finish(error?: Error) {
      if (this.closed) return;
      this.closed = true;
      for (const listener of this.closeListeners)
        Promise.resolve(listener(error)).catch(() => {});
      this.closeListeners.clear();
    }
  };
}
/** Original zg; control envelopes share a port with browser RPC messages. */
export function splitKernelTransport(transport: KernelTransport) {
  const callbacks: Partial<
    Record<"browser" | "control", (message: any) => void>
  > = {};
  const channel = (name: "browser" | "control"): KernelTransport => ({
    addCloseListener: transport.addCloseListener?.bind(transport),
    close: transport.close?.bind(transport),
    sendMessage: (message) =>
      transport.sendMessage(
        name === "control" ? { ...message, type: "control" } : message,
      ),
    setMessageCallback(callback) {
      callbacks[name] = callback;
    },
  });
  transport.setMessageCallback((message) =>
    callbacks[message.type === "control" ? "control" : "browser"]?.(message),
  );
  return {
    browserTransport: channel("browser"),
    controlTransport: channel("control"),
  };
}
/** Original Wg. Accept only the extension's non-tab kernel-host document and matching scope. */
export function registerKernelConnections(
  runtime: Pick<
    typeof chrome.runtime,
    "onConnect" | "id" | "getURL" | "lastError"
  >,
  connected: (
    scopeId: string,
    browser: KernelTransport,
    control: KernelTransport,
  ) => void,
  disconnected?: (scopeId: string) => void,
) {
  const Transport = createKernelPortTransportClass(runtime);
  const active = new Map<string, InstanceType<typeof Transport>>();
  runtime.onConnect.addListener((port) => {
    if (
      !port.name.startsWith("browser-use-kernel:") ||
      port.sender?.id !== runtime.id
    )
      return;
    const scopeId = port.name.slice(19);
    if (scopeId.length === 0) {
      port.disconnect();
      return;
    }
    let senderUrl: URL;
    try {
      senderUrl = new URL(port.sender.url ?? "");
    } catch {
      port.disconnect();
      return;
    }
    const expected = new URL(runtime.getURL("js-kernel-host.html"));
    if (
      port.sender.tab != null ||
      senderUrl.origin !== expected.origin ||
      senderUrl.protocol !== expected.protocol ||
      senderUrl.host !== expected.host ||
      senderUrl.pathname !== expected.pathname ||
      senderUrl.searchParams.get("scopeId") !== scopeId
    ) {
      port.disconnect();
      return;
    }
    active.get(scopeId)?.close();
    const transport = new Transport(port);
    active.set(scopeId, transport);
    transport.addCloseListener(() => {
      if (active.get(scopeId) === transport) {
        active.delete(scopeId);
        disconnected?.(scopeId);
      }
    });
    const { browserTransport, controlTransport } =
      splitKernelTransport(transport);
    try {
      connected(scopeId, browserTransport, controlTransport);
    } catch (error) {
      transport.close();
      throw error;
    }
  });
}

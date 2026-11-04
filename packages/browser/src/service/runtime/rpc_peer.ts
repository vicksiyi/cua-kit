export interface BrowserRpcTransport {
  setMessageCallback(callback: (message: any) => void): void;
  addCloseListener?(callback: (error?: any) => void): (() => void) | void;
  sendMessage(message: any): void;
  close?(): Promise<unknown> | void;
}
/** Original to: bidirectional JSON-RPC peer, including string rejection values. */
export class BrowserRpcPeer {
  transport: BrowserRpcTransport;
  closed = false;
  nextId = 1;
  pendingRequests = new Map<
    number,
    { resolve: (value: any) => void; reject: (reason: any) => void }
  >();
  requestHandlers = new Map<string, (params: any) => any>();
  eventHandlers = new Map<string, Array<(params: any) => void>>();
  constructor(transport: BrowserRpcTransport) {
    this.transport = transport;
    transport.setMessageCallback((message) => {
      this.handleIncomingMessage(message);
    });
    transport.addCloseListener?.((error) => {
      this.closed = true;
      this.rejectPendingRequests(
        error?.message ?? "transport closed before response",
      );
    });
  }
  registerRequestHandlerObject(handlers: any) {
    [
      ...Object.getOwnPropertyNames(handlers),
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(handlers)),
    ]
      .filter(
        (name) =>
          name !== "constructor" && typeof handlers[name] === "function",
      )
      .forEach((name) => {
        const handler = handlers[name];
        if (handler) this.registerRequestHandler(name, handler.bind(handlers));
      });
  }
  registerRequestHandler(name: string, handler: (params: any) => any) {
    this.requestHandlers.set(name, handler);
  }
  addEventListener(name: any, handler: (params: any) => void) {
    const key = name.toString(),
      handlers = this.eventHandlers.get(key) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(key, handlers);
  }
  removeEventListener(name: any, handler: (params: any) => void) {
    const key = name.toString(),
      handlers = this.eventHandlers.get(key) ?? [];
    this.eventHandlers.set(
      key,
      handlers.filter((candidate) => candidate !== handler),
    );
  }
  sendNotification(method: any, params?: any) {
    this.transport.sendMessage({ jsonrpc: "2.0", method, params });
  }
  sendRequest(method: any, params?: any): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      try {
        this.transport.sendMessage({
          jsonrpc: "2.0",
          method: method.toString(),
          params,
          id,
        });
      } catch (error) {
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }
  async handleIncomingMessage(message: any) {
    if ("method" in message) return this.handleIncomingRequest(message);
    if (message.id === undefined) return;
    const pending = this.pendingRequests.get(message.id);
    if (pending) {
      this.pendingRequests.delete(message.id);
      if ("error" in message) {
        pending.reject(message.error?.message || "Something went wrong");
        return;
      }
      pending.resolve(message.result);
    }
  }
  rejectPendingRequests(reason: any) {
    for (const pending of this.pendingRequests.values()) pending.reject(reason);
    this.pendingRequests.clear();
  }
  async handleIncomingRequest(message: any) {
    if (message.id === undefined) {
      (this.eventHandlers.get(message.method ?? "") ?? []).forEach((handler) =>
        handler(message.params),
      );
      return;
    }
    const handler = this.requestHandlers.get(message.method ?? "");
    if (!handler) {
      this.transport.sendMessage({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -1,
          message: `No handler registered for method: ${message.method}`,
        },
      });
      return;
    }
    try {
      const result = await handler(message.params);
      if (this.closed) return;
      this.transport.sendMessage({ jsonrpc: "2.0", id: message.id, result });
    } catch (error) {
      if (this.closed) return;
      this.transport.sendMessage({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: 1,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}

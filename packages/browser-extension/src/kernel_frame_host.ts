import { KernelAgentPeer } from "./kernel_control_client";
import { createKernelPortTransportClass, type KernelTransport } from "./kernel_transport";
import { isScopedKernelMessage, serializeKernelError, type KernelMessage } from "./kernel_offscreen";
import { isKernelHostResponse } from "./kernel_host";
/** Original VU. */
export class KernelAgentTransport {
  closeListeners = new Set<(error?: Error) => unknown>();
  closed = false;
  messageCallback?: (message: any) => void;
  constructor(public port: MessagePort) {
    port.onmessage = event => this.messageCallback?.(event.data);
    port.onmessageerror = () => this.finish(new Error("JavaScript kernel agent port received invalid data"));
    port.start();
  }
  sendMessage(message: any) {
    if (this.closed) throw new Error("JavaScript kernel agent transport is closed");
    this.port.postMessage(message);
  }
  setMessageCallback(callback: (message: any) => void) { this.messageCallback = callback; }
  addCloseListener(listener: (error?: Error) => unknown) {
    this.closeListeners.add(listener);
    return () => { this.closeListeners.delete(listener); };
  }
  async close() { this.finish(); }
  finish(error?: Error) {
    if (this.closed) return;
    this.closed = true;
    this.port.close();
    for (const listener of this.closeListeners) Promise.resolve(listener(error)).catch(() => {});
    this.closeListeners.clear();
  }
}
export interface KernelBrowserBridge {
  browser: Promise<{ apiManifest: unknown; disabledMemberIds: Iterable<string>; executeAgentCommand(params: unknown): Promise<unknown> }>;
  displayBridge: { displayImage(bytes: Uint8Array): Promise<unknown>; displayValue(value: unknown): Promise<unknown> };
  beginExecution(metadata: unknown): void;
  finishExecution(): Promise<unknown>;
}
/** Original WU; binary display is routed separately from value display. */
export function createKernelAgentHandler(bridge: KernelBrowserBridge) {
  return {
    async setup() { const { apiManifest, disabledMemberIds } = await bridge.browser; return { apiManifest, disabledMemberIds: [...disabledMemberIds] }; },
    async execute(params: unknown) { return await (await bridge.browser).executeAgentCommand(params); },
    async display(value: unknown) {
      if (value instanceof Uint8Array) { await bridge.displayBridge.displayImage(value); return; }
      await bridge.displayBridge.displayValue(value);
    },
  };
}
/** Original KU. Port ownership on success/error deliberately follows the source. */
export function executeKernelSandbox(target: Window, message: { id: string; script?: string; type: string }, Channel: typeof MessageChannel = MessageChannel): Promise<any> {
  return new Promise((resolve, reject) => {
    const channel = new Channel();
    channel.port1.onmessage = event => {
      channel.port1.close();
      if (!isKernelHostResponse(event.data) || event.data.id !== message.id) { reject(new Error("JavaScript sandbox returned an invalid result")); return; }
      resolve(event.data);
    };
    channel.port1.onmessageerror = () => { channel.port1.close(); reject(new Error("JavaScript sandbox returned an unreadable result")); };
    try { target.postMessage(message, "*", [channel.port2]); }
    catch (error) { channel.port1.close(); channel.port2.close(); reject(error); }
  });
}
export interface KernelFrameHostServices {
  window: Window;
  document: Document;
  runtime: Pick<typeof chrome.runtime, "getURL" | "connect" | "lastError">;
  MessageChannel: typeof MessageChannel;
  createBrowserBridge(transport: KernelTransport, metadata: unknown): KernelBrowserBridge;
  registerAgentPeer?(transport: KernelAgentTransport, handler: ReturnType<typeof createKernelAgentHandler>): void;
  cleanupBrowser(): Promise<unknown>;
}
/** Original GU. The actual browser bridge and shared service cleanup are required dependencies. */
export function registerKernelFrameHost(host: KernelFrameHostServices) {
  const { window, document, runtime } = host;
  const scopeId = new URLSearchParams(window.location.search).get("scopeId");
  if (!scopeId) throw new Error("JavaScript kernel host requires a thread scope");
  if (window.parent === window) throw new Error("JavaScript kernel host must run inside an iframe");
  const iframe = document.createElement("iframe");
  iframe.hidden = true;
  let metadata: unknown = {};
  let session: { beginExecution(metadata: unknown): void; finishExecution(): Promise<unknown>; dispose(): Promise<void>; close(): void } | undefined;
  let teardown: Promise<unknown> | undefined;
  const BrowserTransport = createKernelPortTransportClass(runtime);
  window.addEventListener("pagehide", () => session?.close(), { once: true });
  window.addEventListener("message", event => {
    if (event.source === window.parent) {
      if (!isScopedKernelMessage(event.data) || event.data.scopeId !== scopeId) return;
      const port = event.ports[0];
      if (port == null) return;
      const message = event.data;
      if (message.type === "js-kernel:execute") execute(message, port);
      else {
        teardown ??= dispose();
        teardown.then(() => port.postMessage({ id: message.id, ok: true }))
          .catch(error => port.postMessage({ error: serializeKernelError(error), id: message.id, ok: false }))
          .finally(() => port.close());
      }
      return;
    }
    if (teardown != null || event.source !== iframe.contentWindow || typeof event.data !== "object" || event.data == null || !("type" in event.data)) return;
    if (event.data.type === "js-kernel:ready") { window.parent.postMessage({ scopeId, type: "js-kernel:host-ready" }, "*"); return; }
    if (event.data.type !== "js-kernel:agent-port") return;
    const port = event.ports[0];
    if (port == null) return;
    session?.close();
    const browser = new BrowserTransport(runtime.connect({ name: `browser-use-kernel:${scopeId}` }));
    const agent = new KernelAgentTransport(port);
    try {
      const bridge = host.createBrowserBridge(browser, metadata);
      if (host.registerAgentPeer) host.registerAgentPeer(agent, createKernelAgentHandler(bridge));
      else new KernelAgentPeer(agent, createKernelAgentHandler(bridge));
      const current = {
        beginExecution: bridge.beginExecution, finishExecution: bridge.finishExecution,
        async dispose() {
          agent.setMessageCallback(() => {});
          removeAgent(); removeBrowser();
          await bridge.browser;
          await host.cleanupBrowser();
        },
        close() { if (session === current) { session = undefined; agent.close(); browser.close(); } },
      };
      const removeAgent = agent.addCloseListener(current.close);
      const removeBrowser = browser.addCloseListener(current.close);
      session = current;
    } catch (error) { agent.close(); browser.close(); throw error; }
  });
  iframe.src = runtime.getURL("js-kernel.html");
  document.body.append(iframe);
  function dispose() { iframe.remove(); return session?.dispose() ?? Promise.resolve(); }
  async function execute(message: KernelMessage, port: MessagePort) {
    try {
      metadata = message.requestMeta;
      session?.beginExecution(metadata);
      const target = iframe.contentWindow;
      if (target == null) throw new Error("JavaScript sandbox is unavailable");
      const result = await executeKernelSandbox(target, { id: message.id, script: message.script, type: "js-kernel:execute" }, host.MessageChannel);
      if (teardown != null) return;
      const current = session;
      if (current == null) throw new Error("JavaScript browser session is unavailable");
      const output = await current.finishExecution();
      if (teardown != null) return;
      const resetRequired = !result.ok && result.error?.name === "JsKernelWorkerResetError" ? true : undefined;
      if (resetRequired) current.close();
      port.postMessage({ error: result.ok ? undefined : result.error, id: message.id, ok: result.ok, output, resetRequired });
    } catch (error) {
      if (teardown != null) return;
      session?.close();
      port.postMessage({ error: serializeKernelError(error), id: message.id, ok: false, output: { contentItems: [] }, resetRequired: true });
    } finally { port.close(); }
  }
}

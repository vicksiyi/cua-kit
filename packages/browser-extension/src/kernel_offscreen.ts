import { isKernelHostResponse } from "./kernel_host";
export interface KernelMessage {
  id: string; scopeId: string; type: "js-kernel:execute" | "js-kernel:cancel" | "js-kernel:reset";
  script?: string; requestMeta?: unknown;
}
/** Protocol chunk n/t. Metadata presence is checked; its contents are not constrained here. */
export function isScopedKernelMessage(value: any): value is KernelMessage {
  if (typeof value !== "object" || value == null || !("id" in value) || typeof value.id !== "string" || !("type" in value)) return false;
  if (!(value.type === "js-kernel:cancel" || value.type === "js-kernel:reset" ||
    (value.type === "js-kernel:execute" && "script" in value && typeof value.script === "string"))) return false;
  return "scopeId" in value && typeof value.scopeId === "string" && value.scopeId.length > 0 &&
    (value.type !== "js-kernel:execute" || "requestMeta" in value);
}
export function serializeKernelError(error: unknown) {
  return error instanceof Error ? { message: error.message, name: error.name, stack: error.stack } :
    { message: typeof error === "string" ? error : "JavaScript execution failed", name: "Error" };
}
interface KernelFrame {
  activeExecutionId?: string;
  executionDispatched: boolean;
  teardown?: Promise<void>;
  iframe: HTMLIFrameElement;
  ready: Promise<void>;
  rejectExecution?: (error: Error) => void;
  dispose(error?: Error): void;
}
export interface KernelOffscreenHost {
  runtime: {
    id: string;
    getURL(path: string): string;
    onMessage: { addListener(listener: (message: any, sender: { id?: string; tab?: unknown; url?: string }, respond: (value: any) => void) => boolean): void };
  };
  document: Document;
  window: Window;
  MessageChannel: typeof MessageChannel;
}
/** Complete offscreen chunk x/h/u/k/w, with browser globals supplied by the entrypoint. */
export function registerKernelOffscreen(host: KernelOffscreenHost) {
  const frames = new Map<string, KernelFrame>();
  host.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== host.runtime.id || sender.tab != null || !isScopedKernelMessage(message)) return false;
    if (sender.url != null) {
      let url: URL;
      try { url = new URL(sender.url); } catch { return false; }
      const own = new URL(host.runtime.getURL(""));
      if (url.protocol !== own.protocol || url.host !== own.host) return false;
    }
    handle(message).then(respond).catch(error => respond({ error: serializeKernelError(error), id: message.id, ok: false }));
    return true;
  });
  async function handle(message: KernelMessage) {
    let frame = frames.get(message.scopeId);
    if (message.type === "js-kernel:cancel") {
      if (frame?.activeExecutionId === message.id) await teardown(frame, message, new Error("JavaScript execution was cancelled; kernel was reset"));
      return { id: message.id, ok: true };
    }
    if (message.type === "js-kernel:reset") {
      if (frame != null) await teardown(frame, message);
      return { id: message.id, ok: true };
    }
    frame ??= createFrame(message.scopeId);
    if (frame.activeExecutionId != null || frame.teardown != null) throw new Error("JavaScript kernel is already executing");
    frame.activeExecutionId = message.id;
    let response: any;
    try { response = await dispatch(frame, message); return response; }
    finally {
      await Promise.resolve(frame.teardown).catch(() => {});
      if (response == null || response.resetRequired) frame.dispose();
      frame.activeExecutionId = undefined;
    }
  }
  async function teardown(frame: KernelFrame, message: KernelMessage, error?: Error) {
    frame.teardown ??= (async () => {
      try {
        if (frame.executionDispatched) {
          const response = await dispatch(frame, message);
          if (!response.ok) throw new Error(response.error?.message ?? "JavaScript kernel cleanup failed");
        }
      } finally { frame.dispose(error); }
    })();
    await frame.teardown;
  }
  function createFrame(scopeId: string) {
    const iframe = host.document.createElement("iframe");
    iframe.hidden = true;
    let cleanup: (() => void) | undefined, rejectReady: ((error: Error) => void) | undefined;
    const ready = new Promise<void>((resolve, reject) => {
      rejectReady = reject;
      const receive = (event: MessageEvent) => {
        if (event.source !== iframe.contentWindow || typeof event.data !== "object" || event.data == null ||
          !("type" in event.data) || event.data.type !== "js-kernel:host-ready" ||
          !("scopeId" in event.data) || event.data.scopeId !== scopeId) return;
        cleanup?.(); resolve();
      };
      const timeout = host.window.setTimeout(() => {
        cleanup?.();
        const error = new Error("JavaScript sandbox did not initialize within 5 seconds");
        error.name = "JsKernelInitializationTimeoutError";
        reject(error);
      }, 5000);
      cleanup = () => { host.window.clearTimeout(timeout); host.window.removeEventListener("message", receive); cleanup = undefined; };
      host.window.addEventListener("message", receive);
    });
    iframe.src = `${host.runtime.getURL("js-kernel-host.html")}?scopeId=${encodeURIComponent(scopeId)}`;
    host.document.body.append(iframe);
    const frame: KernelFrame = {
      activeExecutionId: undefined, executionDispatched: false, iframe, ready,
      dispose(error = new Error("JavaScript kernel was reset")) {
        if (frames.get(scopeId) === frame) {
          frames.delete(scopeId); cleanup?.(); rejectReady?.(error); frame.rejectExecution?.(error); iframe.remove();
        }
      },
    };
    frames.set(scopeId, frame);
    return frame;
  }
  async function dispatch(frame: KernelFrame, message: KernelMessage): Promise<any> {
    await frame.ready;
    if (message.type === "js-kernel:execute" && frame.teardown != null) throw new Error("JavaScript kernel was reset");
    const target = frame.iframe.contentWindow;
    if (target == null) throw new Error("JavaScript kernel host is unavailable");
    const channel = new host.MessageChannel();
    let timeout: number | undefined;
    try {
      return await new Promise((resolve, reject) => {
        if (message.type === "js-kernel:execute") { frame.rejectExecution = reject; frame.executionDispatched = true; }
        else timeout = host.window.setTimeout(() => reject(new Error("JavaScript kernel cleanup did not finish within 5 seconds")), 5000);
        channel.port1.onmessage = event => {
          if (!isKernelHostResponse(event.data) || event.data.id !== message.id) { reject(new Error("JavaScript sandbox returned an invalid result")); return; }
          resolve(event.data);
        };
        channel.port1.onmessageerror = () => reject(new Error("JavaScript sandbox returned an unreadable result"));
        target.postMessage(message, "*", [channel.port2]);
      });
    } finally {
      host.window.clearTimeout(timeout);
      if (message.type === "js-kernel:execute") frame.rejectExecution = undefined;
      channel.port1.close(); channel.port2.close();
    }
  }
}

import { isKernelHostResponse } from "./kernel_host";
import { serializeKernelError } from "./kernel_offscreen";
/** Original sandbox d; unlike the offscreen guard this does not require scopeId. */
export function isKernelSandboxMessage(value: any): value is { id: string; type: string; script: string } {
  if (typeof value !== "object" || value == null || !("id" in value) || typeof value.id !== "string" || !("type" in value)) return false;
  return value.type === "js-kernel:cancel" || value.type === "js-kernel:reset" ||
    (value.type === "js-kernel:execute" && "script" in value && typeof value.script === "string");
}
export type KernelSandboxWorker = Pick<Worker, "addEventListener" | "postMessage" | "terminate">;
/** Original m. Worker construction and initial port transfer may throw synchronously. */
export class KernelSandbox {
  pending = new Map<string, { resolve(): void; reject(error: unknown): void }>();
  nextRequestId = 0;
  resetError?: Error;
  worker: KernelSandboxWorker | null = null;
  constructor(
    readonly onAgentPort: (port: MessagePort) => void,
    readonly createWorker: () => KernelSandboxWorker,
    readonly Channel: typeof MessageChannel = MessageChannel,
  ) {}
  executeJs(script: string): Promise<void> {
    if (this.resetError != null) return Promise.reject(this.resetError);
    const worker = this.getWorker(), id = String(this.nextRequestId++);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try { worker.postMessage({ id, script, type: "js-kernel:execute" }); }
      catch (error) { this.fail(error); }
    });
  }
  getWorker() {
    if (this.worker != null) return this.worker;
    const worker = this.createWorker();
    worker.addEventListener("message", event => { if (isKernelHostResponse(event.data)) this.handleResponse(event.data); });
    worker.addEventListener("error", event => { this.fail(new Error(event.message || "JavaScript worker failed")); });
    worker.addEventListener("messageerror", () => { this.fail(new Error("JavaScript worker returned an invalid result")); });
    const channel = new this.Channel();
    worker.postMessage({ type: "js-kernel:agent-port" }, [channel.port1]);
    this.onAgentPort(channel.port2);
    this.worker = worker;
    return worker;
  }
  handleResponse(response: { id: string; ok: boolean; error?: { message?: string; name?: string; stack?: string } }) {
    const pending = this.pending.get(response.id);
    if (pending == null) return;
    this.pending.delete(response.id);
    if (response.ok) { pending.resolve(); return; }
    const error = new Error(response.error?.message ?? "JavaScript execution failed");
    error.name = response.error?.name ?? "Error";
    if (response.error?.stack != null) error.stack = response.error.stack;
    pending.reject(error);
  }
  fail(reason: unknown) {
    this.worker?.terminate();
    this.worker = null;
    const error = new Error(`${reason instanceof Error ? reason.message : "JavaScript worker stopped"}; this task's JavaScript kernel will be reset.`);
    error.name = "JsKernelWorkerResetError";
    this.resetError = error;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
/** Original f/_/p wiring. Cancellation/reset are handled outside this sandbox. */
export function registerKernelSandbox(window: Window, createWorker: () => KernelSandboxWorker, Channel: typeof MessageChannel = MessageChannel) {
  const sandbox = new KernelSandbox(port => window.parent.postMessage({ type: "js-kernel:agent-port" }, "*", [port]), createWorker, Channel);
  window.addEventListener("message", event => {
    if (event.source !== window.parent || !isKernelSandboxMessage(event.data) || event.data.type !== "js-kernel:execute") return;
    const port = event.ports[0];
    if (port != null) void execute(event.data, port);
  });
  window.parent.postMessage({ type: "js-kernel:ready" }, "*");
  async function execute(message: { id: string; script: string }, port: MessagePort) {
    try { await sandbox.executeJs(message.script); port.postMessage({ id: message.id, ok: true }); }
    catch (error) { port.postMessage({ error: serializeKernelError(error), id: message.id, ok: false }); }
    finally { port.close(); }
  }
  return sandbox;
}

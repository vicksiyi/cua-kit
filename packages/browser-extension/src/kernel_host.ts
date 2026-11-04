export interface KernelHostRuntime {
  getURL(path: string): string;
  getContexts(filter: { contextTypes: string[]; documentUrls: string[] }): Promise<unknown[]>;
  sendMessage(message: unknown): Promise<any>;
}
export interface KernelHostServices {
  runtime: KernelHostRuntime;
  offscreen: { createDocument(options: { justification: string; reasons: string[]; url: string }): Promise<void> };
  randomUUID(): string;
}
export function kernelExecutionError(value: any) {
  const error = new Error(value?.message ?? "JavaScript execution failed");
  error.name = value?.name ?? "Error";
  if (value?.stack != null) error.stack = value.stack;
  return error;
}
export function isKernelHostResponse(value: any): boolean {
  return typeof value === "object" && value != null && "id" in value &&
    typeof value.id === "string" && "ok" in value && typeof value.ok === "boolean";
}
/** Original Jg/Yg/El/Qg: background-side bridge to the persistent offscreen kernel host. */
export function createKernelHostRegistry(host: KernelHostServices) {
  let initializing: Promise<void> | undefined;
  const kernels = new Map<string, KernelHost>();
  function ensureOffscreen() {
    initializing ??= (async () => {
      const path = "js-kernel-offscreen.html";
      const contexts = await host.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [host.runtime.getURL(path)],
      });
      if (contexts.length === 0) await host.offscreen.createDocument({
        justification: "Run isolated, persistent browser JavaScript kernels.",
        reasons: ["IFRAME_SCRIPTING", "WORKERS"], url: path,
      });
    })().finally(() => { initializing = undefined; });
    return initializing;
  }
  class KernelHost {
    constructor(public scopeId: string) {}
    async reset() {
      const message = { id: host.randomUUID(), scopeId: this.scopeId, type: "js-kernel:reset" };
      const response = this.readResponse(await host.runtime.sendMessage(message), message.id);
      if (!response.ok) throw kernelExecutionError(response.error);
    }
    async executeJs(script: string, signal?: AbortSignal, requestMeta: Record<string, unknown> = {}) {
      if (signal?.aborted) throw signal.reason;
      const message = { id: host.randomUUID(), requestMeta, scopeId: this.scopeId, script, type: "js-kernel:execute" };
      let onAbort: (() => void) | undefined;
      let cancellation: Promise<unknown> | undefined;
      const execution = host.runtime.sendMessage(message);
      try {
        const value = signal == null ? await execution : await Promise.race([
          execution,
          new Promise<never>((_resolve, reject) => {
            onAbort = () => {
              cancellation = host.runtime.sendMessage({ id: message.id, scopeId: this.scopeId, type: "js-kernel:cancel" }).catch(() => {});
              reject(signal.reason);
            };
            signal.addEventListener("abort", onAbort, { once: true });
            if (signal.aborted) onAbort();
          }),
        ]);
        const response = this.readResponse(value, message.id);
        if (response.output == null) throw response.ok
          ? new Error("JavaScript kernel returned no execution output")
          : kernelExecutionError(response.error);
        return { ...response.output, resetRequired: response.resetRequired,
          error: response.ok ? undefined : (response.error ?? { message: "JavaScript execution failed", name: "Error" }) };
      } finally {
        if (onAbort != null) signal?.removeEventListener("abort", onAbort);
        await cancellation;
      }
    }
    readResponse(value: any, id: string) {
      if (!isKernelHostResponse(value) || value.id !== id)
        throw new Error("JavaScript kernel returned an invalid result");
      if ((value.resetRequired || (value.output == null && value.error?.name === "JsKernelInitializationTimeoutError")) && kernels.get(this.scopeId) === this)
        kernels.delete(this.scopeId);
      return value;
    }
  }
  return {
    ensureOffscreen,
    async get(scopeId: string, signal?: AbortSignal) {
      if (!scopeId) throw new Error("JavaScript kernel requires a session scope");
      signal?.throwIfAborted();
      await ensureOffscreen();
      signal?.throwIfAborted();
      let kernel = kernels.get(scopeId);
      if (kernel == null) { kernel = new KernelHost(scopeId); kernels.set(scopeId, kernel); }
      return kernel;
    },
    async reset(scopeId: string) {
      const kernel = kernels.get(scopeId);
      if (kernel != null) try { await kernel.reset(); }
      finally { if (kernels.get(scopeId) === kernel) kernels.delete(scopeId); }
    },
  };
}

/** Independently authored supervisor core, not recovered Rust. No implicit OS authority. */
import type { NativePipeHost } from "./native-pipe-host";
import { ExecutionDeadline } from "./execution-deadline";
import { randomUUID } from "node:crypto";
import { isAbsolute, basename } from "node:path";
import { realpath, stat } from "node:fs/promises";
export type Message = Record<string, any>;
export interface WorkerPort {
  send(message: Message): void;
  onMessage(listener: (message: Message) => void): () => void;
  onExit(listener: () => void): () => void;
  close(): Promise<void>;
}
export interface WorkerPair {
  kernel: WorkerPort;
  trusted: WorkerPort;
}
export interface HostContext {
  execId: string;
  requestMeta: unknown;
  signal: AbortSignal;
}
export interface SessionOptions {
  /** Launcher owns OS isolation, bounded JSONL transport and secret filtering. */
  launch(): Promise<WorkerPair>;
  /** Explicit services only; kernel-supplied names cannot expand the set. */
  services: readonly string[];
  /** Must enforce the launcher's module access policy; no default expansion of filesystem authority. */
  authorizeModuleDirectory?(path: string, signal?: AbortSignal): Promise<void>;
  /** One generation-scoped transport; events may arrive between cells. */
  nativePipeHost?(emit: (message: Message) => void): NativePipeHost;
  hostRequest?(
    message: Readonly<Message>,
    context: HostContext,
  ): Promise<Message>;
}
export interface TurnEvent {
  hook_event_name: string;
  session_id: string;
  turn_id: string;
}
interface RunOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  requestMeta?: unknown;
  formElicitationSupported?: boolean;
}
interface Pending {
  kind: "exec" | "turn_ended";
  id: string;
  meta: unknown;
  form: boolean;
  controller: AbortController;
  rpc: Set<string>;
  hostActive: Set<string>;
  hostSeen: Set<string>;
  deadline: ExecutionDeadline;
  removeAbort(): void;
  resolve(result: Message): void;
  reject(error: Error): void;
}
export class WorkerSession {
  private pair?: WorkerPair;
  private pipeHosts = new WeakMap<
    WorkerPair,
    { host: NativePipeHost; seen: Set<string> }
  >();
  private moduleDirectories = new Set<string>();
  private endedTurns = new Map<string, Promise<Message>>();
  private launching?: Promise<WorkerPair>;
  private closings = new WeakMap<WorkerPair, Promise<void>>();
  private detach: Array<() => void> = [];
  private pending?: Pending;
  private epoch = 0;
  private closed = false;
  private queue: Promise<unknown> = Promise.resolve();
  private retirement: Promise<void> = Promise.resolve();
  constructor(private readonly options: SessionOptions) {}
  execute(code: string, options: RunOptions = {}): Promise<Message> {
    const next = this.queue.then(() =>
      this.run({ type: "exec", code }, options),
    );
    this.queue = next.catch(() => {});
    return next;
  }
  addNodeModuleDirectory(path: string, signal?: AbortSignal): Promise<void> {
    const next = this.queue.then(async () => {
      if (this.closed) throw Error("Supervisor session is closed");
      if (
        typeof path !== "string" ||
        !isAbsolute(path) ||
        basename(path) !== "node_modules" ||
        path !== path.trim()
      )
        throw Error("Expected an absolute node_modules directory");
      if (signal?.aborted) throw Error("Module registration cancelled");
      await this.retirement;
      const epoch = this.epoch;
      if (!this.options.authorizeModuleDirectory)
        throw Error("Module-directory policy is not configured");
      const canonical = await realpath(path);
      if (
        basename(canonical) !== "node_modules" ||
        !(await stat(canonical)).isDirectory()
      )
        throw Error("Expected a real node_modules directory");
      await this.options.authorizeModuleDirectory(canonical, signal);
      if (signal?.aborted) throw Error("Module registration cancelled");
      if (this.closed || epoch !== this.epoch)
        throw Error("Session changed during module registration");
      if (this.moduleDirectories.has(canonical)) return;
      try {
        this.pair?.kernel.send({
          type: "add_node_module_dir",
          path: canonical,
        });
        this.moduleDirectories.add(canonical);
      } catch (error) {
        await this.retire(
          error instanceof Error ? error : Error(String(error)),
        );
        throw error;
      }
    });
    this.queue = next.catch(() => {});
    return next;
  }
  /** Host lifecycle boundary; never exposed to submitted JavaScript. */
  turnEnded(event: TurnEvent, options: RunOptions = {}): Promise<Message> {
    const keys = ["hook_event_name", "session_id", "turn_id"];
    if (
      !event ||
      typeof event !== "object" ||
      Array.isArray(event) ||
      Object.keys(event).some((key) => !keys.includes(key)) ||
      keys.some(
        (key) =>
          typeof (event as any)[key] !== "string" ||
          !(event as any)[key].length,
      )
    )
      return Promise.reject(Error("Invalid turn-ended event"));
    if (this.closed)
      return Promise.reject(Error("Supervisor session is closed"));
    const snapshot = Object.freeze({ ...event });
    const key = JSON.stringify([snapshot.session_id, snapshot.turn_id]);
    const existing = this.endedTurns.get(key);
    if (existing) return existing;
    const next = this.queue.then(() =>
      this.run({ type: "turn_ended", event: snapshot }, options),
    );
    this.endedTurns.set(key, next);
    this.queue = next.catch(() => {
      this.endedTurns.delete(key);
    });
    return next;
  }
  private async run(
    operation:
      { type: "exec"; code: string } | { type: "turn_ended"; event: TurnEvent },
    options: RunOptions,
  ) {
    if (this.closed) throw Error("Supervisor session is closed");
    const timeout = options.timeoutMs ?? 30000;
    if (
      (operation.type === "exec" && typeof operation.code !== "string") ||
      !Number.isSafeInteger(timeout) ||
      timeout < 1
    )
      throw Error("Invalid execution request");
    if (options.signal?.aborted)
      throw Error("Execution cancelled before launch");
    await this.retirement;
    const epoch = this.epoch;
    if (!this.pair) {
      const launching = this.options.launch();
      this.launching = launching;
      let pair: WorkerPair;
      try {
        pair = await launching;
      } finally {
        if (this.launching === launching) this.launching = undefined;
      }
      if (this.closed || epoch !== this.epoch) {
        await this.closePair(pair);
        throw Error("Session changed during worker launch");
      }
      // The recovered kernel has no acknowledgement for this notification.
      // Replay before the first cell; JSONL ordering preserves registration-before-exec.
      try {
        for (const path of this.moduleDirectories)
          pair.kernel.send({ type: "add_node_module_dir", path });
      } catch (error) {
        await this.closePair(pair);
        throw error;
      }
      this.pair = pair;
      try {
        if (this.options.nativePipeHost) {
          const host = this.options.nativePipeHost((message) => {
            if (this.pair !== pair) return;
            try {
              pair.trusted.send(message);
            } catch (error) {
              void this.retire(
                error instanceof Error ? error : Error(String(error)),
              );
            }
          });
          this.pipeHosts.set(pair, { host, seen: new Set() });
        }
      } catch (error) {
        await this.retire(
          error instanceof Error ? error : Error(String(error)),
        );
        throw error;
      }
      for (const side of ["kernel", "trusted"] as const) {
        this.detach.push(
          pair[side].onMessage((message) => {
            if (this.pair === pair) this.receive(side, message);
          }),
        );
        this.detach.push(
          pair[side].onExit(() => {
            if (this.pair === pair)
              void this.retire(Error(`${side} worker exited`));
          }),
        );
      }
    }
    if (options.signal?.aborted)
      throw Error("Execution cancelled before dispatch");
    return new Promise<Message>((resolve, reject) => {
      const id = randomUUID();
      const abort = () => {
        void this.retire(Error("Execution cancelled; worker state discarded"));
      };
      const deadline = new ExecutionDeadline(timeout, () => {
        void this.retire(Error("Execution timed out; worker state discarded"));
      });
      this.pending = {
        kind: operation.type,
        id,
        meta: options.requestMeta,
        form: options.formElicitationSupported ?? false,
        controller: new AbortController(),
        rpc: new Set(),
        hostActive: new Set(),
        hostSeen: new Set(),
        deadline,
        removeAbort: () => options.signal?.removeEventListener("abort", abort),
        resolve,
        reject,
      };
      options.signal?.addEventListener("abort", abort, { once: true });
      try {
        this.pair![operation.type === "exec" ? "kernel" : "trusted"].send({
          ...operation,
          id,
          request_meta: options.requestMeta,
          form_elicitation_supported: options.formElicitationSupported ?? false,
        });
      } catch (error) {
        void this.retire(error instanceof Error ? error : Error(String(error)));
      }
    });
  }
  private receive(side: "kernel" | "trusted", message: Message) {
    const pending = this.pending,
      pair = this.pair;
    if (!pair) return;
    if (side === "trusted" && message?.type === "native_pipe_request") {
      void this.nativePipe(message, pair);
      return;
    }
    if (!pending) return;
    if (!message || typeof message !== "object") {
      void this.retire(Error("Malformed worker message"));
      return;
    }
    try {
      if (side === "trusted" && message.type === "turn_ended_result") {
        if (pending.kind !== "turn_ended" || message.id !== pending.id)
          throw Error("Turn-ended response identity mismatch");
        if (pending.deadline.suspended)
          throw Error("Turn-ended completed with timeout still suspended");
        if (pending.hostActive.size)
          throw Error(
            "Operation completed with outstanding host requests; outcome unknown",
          );
        this.finish();
        pending.resolve(message);
        return;
      }
      if (side === "kernel" && pending.kind !== "exec")
        throw Error("Kernel message during host lifecycle operation");
      if (side === "kernel" && message.type === "exec_result") {
        if (message.id !== pending.id)
          throw Error("Execution response identity mismatch");
        if (pending.rpc.size)
          throw Error("Execution completed with outstanding trusted RPC");
        if (pending.hostActive.size)
          throw Error(
            "Operation completed with outstanding host requests; outcome unknown",
          );
        this.finish();
        pending.resolve(message);
        return;
      }
      if (
        side === "kernel" &&
        ["trusted_service_request", "trusted_service_hooks"].includes(
          message.type,
        )
      ) {
        if (
          message.exec_id !== pending.id ||
          typeof message.id !== "string" ||
          pending.rpc.has(message.id)
        )
          throw Error("Invalid trusted RPC correlation");
        if (
          message.type === "trusted_service_request" &&
          !this.options.services.includes(message.service)
        ) {
          pair.kernel.send({
            id: message.id,
            ok: false,
            error: "Trusted service is not configured",
          });
          return;
        }
        pending.rpc.add(message.id);
        pair.trusted.send({
          ...message,
          type:
            message.type === "trusted_service_request"
              ? "service"
              : "run_hooks",
          request_meta: pending.meta,
          form_elicitation_supported: pending.form,
        });
        return;
      }
      if (side === "trusted" && message.type === "trusted_service_response") {
        if (!pending.rpc.delete(message.id))
          throw Error("Uncorrelated trusted response");
        if (!pending.rpc.size && pending.deadline.suspended)
          throw Error("Trusted RPC completed with timeout still suspended");
        pair.kernel.send(message);
        return;
      }
      if (
        side === "trusted" &&
        ["suspend_timeout", "resume_timeout"].includes(message.type)
      ) {
        if (
          message.exec_id !== pending.id ||
          (pending.kind !== "turn_ended" && !pending.rpc.size)
        )
          throw Error("Uncorrelated timeout control");
        if (message.type === "suspend_timeout") pending.deadline.suspend();
        else pending.deadline.resume();
        return;
      }
      const allowed =
        side === "kernel"
          ? ["emit_image", "emit_audio"]
          : [
              "emit_image",
              "emit_audio",
              "elicit",
              "authenticated_fetch",
              "config_action",
              "launch_services_action",
            ];
      if (allowed.includes(message.type)) {
        if (
          typeof message.id !== "string" ||
          message.exec_id !== pending.id ||
          (side === "trusted" &&
            pending.kind !== "turn_ended" &&
            pending.rpc.size === 0)
        )
          throw Error("Uncorrelated host operation");
        const key = JSON.stringify([side, message.id]);
        if (pending.hostSeen.has(key))
          throw Error("Duplicate host request identity");
        pending.hostSeen.add(key);
        pending.hostActive.add(key);
        void this.host(side, message, pending, pair, key);
        return;
      }
      const notifications =
        side === "kernel"
          ? ["submitted_code_complete", "exec_redacted_source"]
          : ["response_meta", "response_meta_trace", "otel_log"];
      if (!notifications.includes(message.type))
        throw Error(`Unsupported ${side} worker message: ${message.type}`);
      // Response metadata and telemetry integration remain outstanding.
    } catch (error) {
      void this.retire(error instanceof Error ? error : Error(String(error)));
    }
  }
  private async nativePipe(message: Message, pair: WorkerPair) {
    const state = this.pipeHosts.get(pair);
    let result: Message;
    try {
      if (!state) throw Error("Native pipe host is not configured");
      if (
        typeof message.id !== "string" ||
        !message.id ||
        state.seen.has(message.id)
      ) {
        await this.retire(Error("Invalid native pipe request identity"));
        return;
      }
      state.seen.add(message.id);
      result = {
        ok: true,
        result: await state.host.request(Object.freeze({ ...message })),
      };
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (this.pair !== pair) return;
    try {
      pair.trusted.send({
        ...result,
        type: "native_pipe_response",
        id: message.id,
      });
    } catch (error) {
      void this.retire(error instanceof Error ? error : Error(String(error)));
    }
  }
  private async host(
    side: "kernel" | "trusted",
    message: Message,
    pending: Pending,
    pair: WorkerPair,
    key: string,
  ) {
    let result: Message;
    try {
      if (!this.options.hostRequest)
        throw Error(`Host operation is not configured: ${message.type}`);
      result = await this.options.hostRequest(Object.freeze({ ...message }), {
        execId: pending.id,
        requestMeta: pending.meta,
        signal: pending.controller.signal,
      });
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (this.pending !== pending || this.pair !== pair) return;
    try {
      pending.hostActive.delete(key);
      pair[side].send({
        ...result,
        id: message.id,
        ...(message.type === "native_pipe_request"
          ? { type: "native_pipe_response" }
          : {}),
      });
    } catch (error) {
      void this.retire(error instanceof Error ? error : Error(String(error)));
    }
  }
  private finish() {
    const pending = this.pending;
    this.pending = undefined;
    if (pending) {
      pending.deadline.dispose();
      pending.removeAbort();
      pending.controller.abort();
    }
    return pending;
  }
  private closePair(pair: WorkerPair): Promise<void> {
    let closed = this.closings.get(pair);
    if (!closed) {
      closed = Promise.all([
        pair.kernel.close(),
        pair.trusted.close(),
        this.pipeHosts.get(pair)?.host.close(),
      ]).then(() => {});
      this.closings.set(pair, closed);
    }
    return closed;
  }
  private retire(error: Error): Promise<void> {
    this.epoch++;
    const pair = this.pair;
    this.pair = undefined;
    for (const off of this.detach.splice(0)) off();
    const pending = this.finish();
    const closing = pair
      ? this.closePair(pair)
      : this.launching
        ? this.launching.then(
            (pair) => this.closePair(pair),
            () => {},
          )
        : Promise.resolve();
    this.retirement = Promise.all([this.retirement, closing]).then(() => {});
    void this.retirement.catch(() => {});
    // Fail the request immediately, but do not launch another generation until retirement finishes.
    pending?.reject(error);
    return this.retirement;
  }
  reset() {
    return this.retire(Error("Session reset; worker state discarded"));
  }
  async close() {
    this.closed = true;
    await this.retire(Error("Supervisor session closed"));
  }
}

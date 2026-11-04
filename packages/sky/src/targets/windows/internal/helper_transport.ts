import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { codexTurnMetadataFromRequestMeta } from "./codex_turn_metadata";
import {
  addApprovedApp,
  addRequestBudget,
  parseApprovalRequest,
  requestAppApproval,
  scopeKey,
  turnScopeProtocol,
  USER_STOPPED_MESSAGE,
  type ApprovalRequest,
  type TurnScope,
} from "./helper_protocol";
export type HelperTransportOptions = {
  helperArgs?: string[];
  helperCommand: string;
  helperEnv?: Record<string, string | undefined>;
  preserveHelperOnTimeout?: boolean;
  timeoutMs?: number;
};
type ElicitationResponse = {
  action?: string;
  content?: unknown;
  _meta?: Record<string, unknown> | null;
};
type CreateElicitation = (
  request: unknown,
) => Promise<ElicitationResponse> | ElicitationResponse;
export type HelperRequestOptions = {
  codexTurnMetadata?: unknown;
  createElicitation?: CreateElicitation;
  skipTurnTransition?: boolean;
  timeoutMs?: number;
};
type Reply =
  | { kind: "result"; result: unknown }
  | { kind: "approval"; approvalRequest: ApprovalRequest };
type Pending = {
  child: ChildProcessWithoutNullStreams;
  resolve: (reply: Reply) => void;
  reject: (error: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
  turnScope: TurnScope | null;
};
export class WindowsHelperTransport {
  #child: ChildProcessWithoutNullStreams | null = null;
  #activeKey: string | null = null;
  #activeMetadata: unknown = null;
  #args: string[];
  #command: string;
  #env: Record<string, string | undefined> | null;
  #stoppedKey: string | null = null;
  #lastScope: TurnScope | null = null;
  #nextId = 1;
  #pending = new Map<number, Pending>();
  #events = new Set<(event: unknown) => void>();
  #exits = new Set<() => void>();
  #preserve: boolean;
  #stderr = "";
  #stdout = "";
  #launchTimeout: number;
  #requestTimeout: number;
  constructor({
    helperArgs = [],
    helperCommand,
    helperEnv,
    preserveHelperOnTimeout = false,
    timeoutMs,
  }: HelperTransportOptions) {
    this.#args = helperArgs;
    this.#command = helperCommand;
    this.#env = helperEnv ?? null;
    this.#preserve = preserveHelperOnTimeout;
    this.#launchTimeout = timeoutMs ?? 15000;
    this.#requestTimeout = timeoutMs ?? 10000;
  }
  close(): Promise<void> {
    this.#stoppedKey = null;
    const child = this.#child;
    if (child == null) return Promise.resolve();
    if (child.exitCode != null || child.signalCode != null) {
      this.#reset(child);
      return Promise.resolve();
    }
    return this.request("close", {})
      .catch(() => {
        child.kill();
      })
      .finally(() => {
        this.#reset(child);
      })
      .then(() => {});
  }
  onEvent(listener: (event: unknown) => void) {
    this.#events.add(listener);
    return () => this.#events.delete(listener);
  }
  onExit(listener: () => void) {
    this.#exits.add(listener);
    return () => this.#exits.delete(listener);
  }
  async request(
    method: string,
    params: Record<string, unknown>,
    options: HelperRequestOptions = {},
  ): Promise<unknown> {
    const metadata =
      options.codexTurnMetadata ??
      (options.skipTurnTransition === true
        ? this.#activeMetadata
        : codexTurnMetadataFromRequestMeta());
    const scope = turnScopeProtocol.readScope(metadata),
      key = scopeKey(scope);
    if (
      method === "end_turn" &&
      (key == null ||
        key !== this.#activeKey ||
        this.#child == null ||
        this.#child.exitCode != null ||
        this.#child.signalCode != null)
    )
      return null;
    if (this.#stoppedKey != null) {
      if (key === this.#stoppedKey)
        return Promise.reject(new Error(USER_STOPPED_MESSAGE));
      if (key != null) this.#stoppedKey = null;
    }
    if (scope != null && turnScopeProtocol.interrupted(scope)) {
      this.#stoppedKey = key;
      return Promise.reject(new Error(USER_STOPPED_MESSAGE));
    }
    let child = this.#child ?? this.#spawn();
    this.#child = child;
    if (options.skipTurnTransition !== true && method !== "end_turn")
      await this.#transition(child, metadata);
    if (!(
      child.exitCode == null &&
      child.signalCode == null &&
      this.#child === child
    )) {
      if (this.#child === child) this.#reset(child);
      child = this.#child ?? this.#spawn();
      this.#child = child;
      if (options.skipTurnTransition !== true) {
        this.#activeKey = key;
        this.#activeMetadata = key == null ? null : metadata;
      }
    }
    let result: unknown,
      currentMetadata = metadata;
    for (;;) {
      const reply = await this.#send(
        child,
        method,
        params,
        currentMetadata,
        options.timeoutMs ??
          (method === "launch_app"
            ? this.#launchTimeout
            : this.#requestTimeout),
      );
      if (reply.kind === "result") {
        result = reply.result;
        break;
      }
      await requestAppApproval(
        reply.approvalRequest,
        metadata,
        options.createElicitation,
      );
      currentMetadata = addApprovedApp(
        currentMetadata,
        reply.approvalRequest.app,
      );
    }
    if (method === "end_turn" && this.#activeKey === key) {
      this.#activeKey = null;
      this.#activeMetadata = null;
    }
    return result;
  }
  #spawn() {
    const child = spawn(this.#command, this.#args, {
      env:
        this.#env == null
          ? undefined
          : { ...globalThis.process.env, ...this.#env },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    child.unref();
    for (const stream of [child.stdin, child.stdout, child.stderr])
      if ("unref" in stream && typeof stream.unref === "function")
        stream.unref();
    const parentExit = () => {
      if (child.exitCode == null && child.signalCode == null) child.kill();
    };
    globalThis.process.once("exit", parentExit);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (this.#child === child) this.#receive(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (this.#child === child) this.#stderr += chunk;
    });
    child.on("exit", (code, signal) => {
      globalThis.process.off("exit", parentExit);
      if (code === 130) this.#markStopped(this.#lastScope);
      const status =
          signal == null
            ? `exit code ${code ?? "unknown"}`
            : `signal ${signal}`,
        stderr = this.#child === child ? this.#stderr.trim() : "";
      const error =
        code === 130
          ? new Error(USER_STOPPED_MESSAGE)
          : new Error(
              stderr === ""
                ? `computer-use helper exited with ${status}`
                : `computer-use helper exited with ${status}: ${stderr}`,
            );
      this.#reset(child);
      this.#reject(error, child);
      for (const listener of this.#exits) listener();
    });
    child.on("error", (error) => {
      this.#reset(child);
      this.#reject(error, child);
    });
    return child;
  }
  #reset(child: ChildProcessWithoutNullStreams) {
    if (this.#child === child) {
      this.#child = null;
      this.#activeKey = null;
      this.#activeMetadata = null;
      this.#stdout = "";
      this.#stderr = "";
    }
  }
  async #transition(child: ChildProcessWithoutNullStreams, metadata: unknown) {
    const key = scopeKey(turnScopeProtocol.readScope(metadata)),
      previous = this.#activeKey,
      previousMetadata = this.#activeMetadata;
    if (previous != null && previous !== key)
      await this.#send(child, "end_turn", {}, previousMetadata).catch(() => {});
    this.#activeKey = key;
    this.#activeMetadata = key == null ? null : metadata;
  }
  #send(
    child: ChildProcessWithoutNullStreams,
    method: string,
    params: Record<string, unknown>,
    metadata: unknown,
    timeout = method === "launch_app"
      ? this.#launchTimeout
      : this.#requestTimeout,
  ): Promise<Reply> {
    const id = this.#nextId++,
      meta = addRequestBudget(metadata, timeout),
      scope = turnScopeProtocol.readScope(metadata);
    this.#lastScope = scope;
    const line = `${JSON.stringify({ id, method, params, ...(meta == null ? {} : { meta }) })}\n`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.#pending.has(id)) return;
        const error = new Error(`computer-use request timed out: ${method}`);
        if (this.#preserve) {
          this.#pending.delete(id);
          reject(error);
          return;
        }
        this.#reset(child);
        child.kill();
        this.#reject(error, child);
      }, timeout);
      this.#pending.set(id, {
        child,
        resolve,
        reject,
        timeout: timer,
        turnScope: scope,
      });
      child.stdin.write(line, "utf8", (error) => {
        if (error != null) {
          clearTimeout(timer);
          this.#pending.delete(id);
          reject(error);
        }
      });
    });
  }
  #receive(chunk: string) {
    this.#stdout += chunk;
    for (;;) {
      const end = this.#stdout.indexOf("\n");
      if (end === -1) return;
      const line = this.#stdout.slice(0, end).trim();
      this.#stdout = this.#stdout.slice(end + 1);
      if (line !== "") this.#message(line);
    }
  }
  #message(line: string) {
    let response: any;
    try {
      response = JSON.parse(line);
    } catch {
      this.#reject(
        new Error(`computer-use helper emitted invalid JSON: ${line}`),
      );
      return;
    }
    if (typeof response.id !== "number") {
      for (const listener of this.#events) listener(response);
      return;
    }
    const pending = this.#pending.get(response.id);
    if (pending == null) return;
    clearTimeout(pending.timeout);
    this.#pending.delete(response.id);
    if (response.ok) {
      pending.resolve({ kind: "result", result: response.result });
      return;
    }
    const approval = parseApprovalRequest(response.approvalRequest);
    if (approval != null) {
      pending.resolve({ kind: "approval", approvalRequest: approval });
      return;
    }
    const message =
        typeof response.error === "string"
          ? response.error
          : "computer-use helper request failed",
      error = new Error(message);
    if (message === USER_STOPPED_MESSAGE) {
      this.#markStopped(pending.turnScope);
      this.#reset(pending.child);
      pending.child.kill();
      this.#reject(error, pending.child);
    }
    pending.reject(error);
  }
  #reject(error: unknown, child: ChildProcessWithoutNullStreams | null = null) {
    for (const [id, pending] of this.#pending)
      if (child == null || pending.child === child) {
        clearTimeout(pending.timeout);
        pending.reject(error);
        this.#pending.delete(id);
      }
  }
  #markStopped(scope: TurnScope | null) {
    const key = scopeKey(scope);
    if (key != null) {
      this.#stoppedKey = key;
      turnScopeProtocol.markInterrupted(scope);
    }
  }
}

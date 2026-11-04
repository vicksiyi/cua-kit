/** Readable lifecycle portion of original p_/Pl. The tunnel transport and JS
 * consent/execution handler are separate dependencies, not implemented here. */
export interface KernelTurnMetadata {
  thread_source?: unknown;
  thread_id?: unknown;
  session_id?: unknown;
  turn_id?: unknown;
}
export function kernelTurnCleanupMetadata(
  metadata?: KernelTurnMetadata | null,
) {
  const sessionId =
    metadata?.thread_source === "subagent"
      ? metadata.thread_id
      : metadata?.session_id;
  const turnId = metadata?.turn_id;
  if (
    typeof sessionId !== "string" ||
    !sessionId ||
    typeof turnId !== "string" ||
    !turnId
  )
    throw new Error(
      "Browser turn cleanup requires explicit session and turn IDs",
    );
  return { session_id: sessionId, turn_id: turnId };
}
export interface KernelSessionLifecycleHost<Pdf> {
  chatApi: {
    account: { userId: unknown; id: unknown };
    signal: AbortSignal;
    dispose(): void;
  };
  randomUUID(): string;
  disposeTransport(): void;
  resetKernel(scopeId: string): Promise<unknown>;
  onTurnEnded(
    scopeId: string,
    metadata: { session_id: string; turn_id: string },
  ): Promise<unknown>;
  deletePdf(pdf: Pdf): Promise<unknown>;
  errorMetadata(reason: "none"): Record<string, unknown>;
  activity?: { turnEnded(key: string): void };
  warn(message: string): void;
}
export class KernelSessionLifecycle<Pdf> {
  readonly kernelGeneration: string;
  readonly scopeIdsByChannel = new Map<string, Set<string>>();
  readonly scopeOperations = new Map<string, Promise<void>>();
  readonly browserControlChallenges = new Map<
    string,
    { challenge: string; instanceId: string }
  >();
  readonly jsCalls = new Map<AbortController, string>();
  readonly pdfUploadsByTurn = new Map<string, Set<Pdf>>();
  constructor(private readonly host: KernelSessionLifecycleHost<Pdf>) {
    this.kernelGeneration = host.randomUUID();
  }
  kernelScopeId(scope: string) {
    return JSON.stringify([
      this.host.chatApi.account.userId,
      this.host.chatApi.account.id,
      this.kernelGeneration,
      scope,
    ]);
  }
  activityKey(scope: string) {
    return JSON.stringify([
      this.host.chatApi.account.userId,
      this.host.chatApi.account.id,
      scope,
    ]);
  }
  suspend() {
    this.host.disposeTransport();
  }
  dispose() {
    this.host.chatApi.dispose();
    this.host.disposeTransport();
    for (const scopes of this.scopeIdsByChannel.values())
      for (const scope of scopes)
        this.host.resetKernel(this.kernelScopeId(scope)).catch(() => {
          this.host.warn("[node-repl-tunnel] failed to reset disposed kernel");
        });
    this.scopeIdsByChannel.clear();
    this.browserControlChallenges.clear();
  }
  async onSessionTerminated(event: {
    channel?: string | null;
    headers?: Record<string, unknown> | null;
  }) {
    const channel = event.channel ?? "main";
    const scopes = this.scopeIdsByChannel.get(channel);
    const hasSessionHeader = Object.keys(event.headers ?? {}).some(
      (key) => key.toLowerCase() === "mcp-session-id",
    );
    if (!hasSessionHeader)
      for (const scope of scopes ?? [])
        this.browserControlChallenges.delete(scope);
    const scope =
      !hasSessionHeader && scopes?.size === 1
        ? scopes.values().next().value
        : undefined;
    if (scope == null) return hasSessionHeader;
    await this.host.resetKernel(this.kernelScopeId(scope));
    scopes?.delete(scope);
    if (scopes?.size === 0) this.scopeIdsByChannel.delete(channel);
    return true;
  }
  async runInScope<T>(
    scope: string,
    signal: AbortSignal,
    run: () => T | PromiseLike<T>,
  ): Promise<T> {
    signal.throwIfAborted();
    const operation = (
      this.scopeOperations.get(scope) ?? Promise.resolve()
    ).then(run);
    const settled = operation.then(
      () => {},
      () => {},
    );
    this.scopeOperations.set(scope, settled);
    settled.then(() => {
      if (this.scopeOperations.get(scope) === settled)
        this.scopeOperations.delete(scope);
    });
    return await operation;
  }
  async turnEnded(
    signal: AbortSignal,
    context: {
      turnMetadata?: KernelTurnMetadata | null;
      scopeId?: string | null;
    },
  ) {
    const metadata = kernelTurnCleanupMetadata(context.turnMetadata);
    const scope = context.scopeId;
    if (typeof scope !== "string" || scope.length === 0)
      throw new Error("Browser turn cleanup requires a thread scope");
    signal.throwIfAborted();
    const turn = JSON.stringify([scope, metadata.session_id, metadata.turn_id]);
    for (const [controller, activeTurn] of this.jsCalls)
      if (activeTurn === turn)
        controller.abort(new Error("JavaScript execution ended with its turn"));
    await this.runInScope(scope, signal, async () => {
      try {
        this.host.chatApi.signal.throwIfAborted();
        await this.host.onTurnEnded(this.kernelScopeId(scope), metadata);
      } finally {
        const uploads = this.pdfUploadsByTurn.get(turn);
        if (uploads != null) {
          await Promise.all(
            [...uploads].map(async (pdf) => {
              try {
                await this.host.deletePdf(pdf);
                uploads.delete(pdf);
              } catch {
                this.host.warn("Browser PDF turn-end cleanup failed");
              }
            }),
          );
          if (uploads.size === 0) this.pdfUploadsByTurn.delete(turn);
        }
      }
    });
    this.host.activity?.turnEnded(this.activityKey(turn));
    return { _meta: this.host.errorMetadata("none"), content: [] };
  }
}

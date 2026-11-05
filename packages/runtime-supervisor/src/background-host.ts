/** Independent bounded lifetime for restored trusted nodeRepl.fetch operations. */
import type { Message, SessionOptions } from "./session";
export class BackgroundHostRequests {
  private controller = new AbortController();
  private contexts = new Map<
    string,
    { meta: unknown; allowed: boolean; seen: Set<string> }
  >();
  private active = 0;
  constructor(
    private request: SessionOptions["hostRequest"],
    private emit: (message: Message) => void,
  ) {}
  register(id: string, meta: unknown, allowed: boolean) {
    this.contexts.set(id, {
      meta: structuredClone(meta),
      allowed,
      seen: new Set(),
    });
    // Already running operations retain their own context; only future late starts expire.
    while (this.contexts.size > 256)
      this.contexts.delete(this.contexts.keys().next().value!);
  }
  allow(id: string) {
    const context = this.contexts.get(id);
    if (context) context.allowed = true;
  }
  async handle(message: Message) {
    if (this.controller.signal.aborted) return;
    let result: Message;
    const context = this.contexts.get(message.exec_id);
    try {
      if (
        message.type !== "authenticated_fetch" ||
        typeof message.id !== "string" ||
        !message.id ||
        !context?.allowed
      )
        throw Error("Unknown or unauthorized background execution context");
      if (context.seen.has(message.id))
        throw Error("Duplicate background request identity");
      if (context.seen.size >= 1024 || this.active >= 64)
        throw Error("Background request budget exceeded");
      context.seen.add(message.id);
      if (!this.request)
        throw Error("Background host request handler is not configured");
      this.active++;
      try {
        result = await this.request(Object.freeze({ ...message }), {
          execId: message.exec_id,
          requestMeta: structuredClone(context.meta),
          signal: this.controller.signal,
          appendContent: () => {
            throw Error("Background fetch cannot append execution content");
          },
        });
      } finally {
        this.active--;
      }
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (!this.controller.signal.aborted)
      this.emit({ ...result, id: message.id });
  }
  close() {
    this.controller.abort();
    this.contexts.clear();
  }
}

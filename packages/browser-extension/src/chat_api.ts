import { readRetryAfter } from "./siwc";

/** Original Dn. Preserve undefined retryability rather than inventing retry policy. */
export class ChatApiHttpError extends Error {
  constructor(
    public status: number,
    public retryAfterMs?: number,
    public retryable?: boolean,
  ) {
    super(`Chat API request failed (HTTP ${status}).`);
    this.name = "ChatApiHttpError";
  }
}
/** Original Zm: consume only JSON responses with a boolean detail.retryable. */
export async function readChatRetryability(response: Response) {
  if (
    /^application\/json(?:;|$)/iu.test(
      response.headers.get("Content-Type") ?? "",
    )
  ) {
    try {
      const value = await response.json();
      if (typeof value !== "object" || value == null || !("detail" in value))
        return;
      const { detail } = value;
      if (
        typeof detail === "object" &&
        detail != null &&
        "retryable" in detail &&
        typeof detail.retryable === "boolean"
      )
        return detail.retryable;
    } catch {}
  }
}
export interface ChatAccount {
  id: string;
  userId: string;
  structure: "personal" | "workspace";
}
/** Original Yc request/abort/dispose lifecycle; no hidden refresh or automatic retries. */
export function createChatApiClass(host: {
  fetch: typeof globalThis.fetch;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
  now?: () => number;
}) {
  return class ChatApi {
    controller = new AbortController();
    signal = this.controller.signal;
    account: Readonly<ChatAccount>;
    constructor(
      private accessToken: string,
      account: ChatAccount,
    ) {
      this.account = Object.freeze({ ...account });
    }
    async request<T = unknown>(
      path: string,
      init: RequestInit = {},
      options: {
        timeoutMs?: number;
        readResponse?: (response: Response) => Promise<T>;
      } = {},
    ): Promise<T> {
      const timeoutController = new AbortController();
      const signals = [this.signal, timeoutController.signal];
      if (init.signal != null) signals.push(init.signal);
      const signal = AbortSignal.any(signals);
      signal.throwIfAborted();
      const timer = host.setTimeout(
        () => timeoutController.abort(new Error("Chat API request timed out.")),
        options.timeoutMs ?? 15000,
      );
      try {
        let response: Response;
        try {
          const headers = new Headers(init.headers);
          headers.set("Authorization", `Bearer ${this.accessToken}`);
          headers.set("ChatGPT-Account-ID", this.account.id);
          response = await host.fetch(
            `https://chatgpt.com/backend-api${path}`,
            {
              cache: "no-store",
              credentials: "include",
              redirect: "error",
              headers,
              method: init.method ?? "GET",
              body: init.body,
              signal,
            },
          );
        } catch {
          signal.throwIfAborted();
          throw new Error("Chat API request failed.");
        }
        if (!response.ok) {
          const retryable = await readChatRetryability(response);
          await response.body?.cancel().catch(() => {});
          this.signal.throwIfAborted();
          init.signal?.throwIfAborted();
          throw new ChatApiHttpError(
            response.status,
            readRetryAfter(response, (host.now ?? Date.now)()),
            timeoutController.signal.aborted ? false : retryable,
          );
        }
        const value = options.readResponse
          ? await options.readResponse(response)
          : await response.json().catch(() => {
              signal.throwIfAborted();
              throw new Error("Chat API response is not valid JSON.");
            });
        signal.throwIfAborted();
        return value;
      } finally {
        host.clearTimeout(timer);
      }
    }
    dispose() {
      this.controller.abort(new Error("Chat API has been disposed."));
    }
  };
}

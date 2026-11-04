import { SIDE_PANEL_PATH } from "./side_panel_tabs";
interface LoadEvent {
  type: "CODEX_WORK_SIDE_PANEL_LOAD_EVENT";
  event: "timeout" | "ready" | "retry" | "open_chatgpt";
  attempt: number;
  elapsedMs: number;
  timedOut: boolean;
}
/** Original Kk: deliberately accepts inherited properties and additional fields. */
export function isSidePanelLoadEvent(input: unknown): input is LoadEvent {
  if (typeof input !== "object" || input == null) return false;
  const value = input as LoadEvent;
  return (
    value.type === "CODEX_WORK_SIDE_PANEL_LOAD_EVENT" &&
    ["timeout", "ready", "retry", "open_chatgpt"].includes(value.event) &&
    typeof value.attempt === "number" &&
    Number.isSafeInteger(value.attempt) &&
    value.attempt >= 0 &&
    typeof value.elapsedMs === "number" &&
    Number.isSafeInteger(value.elapsedMs) &&
    value.elapsedMs >= 0 &&
    typeof value.timedOut === "boolean"
  );
}
/** Original wk/Zk, independent handlers for the runtime message chain. */
export function createSidePanelMessageHandlers(host: {
  runtime: Pick<typeof chrome.runtime, "id" | "getURL">;
  userAgent: string;
  getInstanceId(): Promise<string>;
  reportMetric(
    name: string,
    value: string,
    tags: Record<string, string>,
  ): Promise<unknown>;
  reportFailure(
    name: string,
    value: number,
    tags: Record<string, string>,
  ): void;
}) {
  function authorized(sender: chrome.runtime.MessageSender) {
    return (
      sender.id === host.runtime.id &&
      sender.url === host.runtime.getURL(SIDE_PANEL_PATH)
    );
  }
  return {
    instanceId(
      message: unknown,
      sender: chrome.runtime.MessageSender,
      reply: (value: { instanceId: string | null }) => void,
    ) {
      if (
        message == null ||
        typeof message !== "object" ||
        !("type" in message) ||
        message.type !== "GET_EXTENSION_INSTANCE_ID"
      )
        return false;
      if (!authorized(sender)) {
        reply({ instanceId: null });
        return true;
      }
      host.getInstanceId().then(
        (instanceId) => reply({ instanceId }),
        () => {
          reply({ instanceId: null });
          host.reportFailure(
            "codex_chrome_extension_browser_context_setup_failure",
            1,
            { surface: "browser_side_chat", stage: "instance_id" },
          );
        },
      );
      return true;
    },
    loadEvent(
      message: unknown,
      sender: chrome.runtime.MessageSender,
      reply: (value?: unknown) => void,
    ) {
      if (!isSidePanelLoadEvent(message)) return false;
      if (!authorized(sender)) {
        reply();
        return true;
      }
      host
        .reportMetric(
          "codex_chrome_extension_work_sidepanel_load",
          message.event,
          {
            attempt: String(message.attempt),
            elapsed_ms: String(message.elapsedMs),
            timed_out: String(message.timedOut),
            extension_id: host.runtime.id,
            chromium_major:
              /(?:Chrome|Chromium)\/(\d+)/.exec(host.userAgent)?.[1] ??
              "unknown",
          },
        )
        .then(reply, reply);
      return true;
    },
  };
}

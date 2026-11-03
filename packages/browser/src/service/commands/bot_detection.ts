import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
import { BotDetectionReport } from "../../commands/tab_developer";
import {
  codexTurnMetadata,
  type PreferenceRuntime,
} from "../preferences/request_context";
/** Original Uc: preserve original values and nullish defaults without coercion. */
export function browserUsageMetadata(
  backend: string | undefined,
  metadata?: Record<string, any>,
) {
  const session = metadata?.session_id ?? "unknown",
    conversation = metadata?.chatgpt_conversation_id,
    thread = metadata?.thread_id ?? session,
    source =
      metadata?.thread_source ??
      (session !== "unknown" && thread === session ? "user" : "unknown");
  return {
    backend,
    conversation_id:
      typeof conversation === "string" && conversation.trim().length > 0
        ? conversation
        : session,
    model: metadata?.model ?? "unknown",
    session_id: session,
    thread_id: thread,
    thread_source: source,
    turn_id: metadata?.turn_id ?? "unknown",
  };
}
/** Original mF: mark before emit, retaining the key if emit throws. */
export function oncePerConversationBackend<T>(
  emit: (
    backend: string,
    metadata: ReturnType<typeof browserUsageMetadata>,
    extra: T,
  ) => unknown,
  seen = new Set<string>(),
) {
  return (
    backend: string,
    metadata: Record<string, any> | undefined,
    extra: T,
  ) => {
    const fields = browserUsageMetadata(backend, metadata),
      key = `${fields.conversation_id}:${backend}`;
    if (!seen.has(key)) {
      seen.add(key);
      emit(backend, fields, extra);
    }
  };
}
/** Original wne/yne. Hostname excludes port, path and query. */
export function botReportHostname(url: string | null | undefined) {
  if (url == null || url.length === 0) return null;
  try {
    const hostname = new URL(url).hostname;
    return hostname.length === 0 ? null : hostname;
  } catch {
    return null;
  }
}
export function botDetectionEvent({
  backend,
  reason,
  turnMetadata,
  url,
}: {
  backend: string | undefined;
  reason: string;
  turnMetadata?: Record<string, any>;
  url: string | null | undefined;
}) {
  const hostname = botReportHostname(url);
  return {
    name: "browser_use_bot_detection_reported",
    value: reason,
    metadata: {
      ...browserUsageMetadata(backend, turnMetadata),
      hostname: hostname ?? "unknown",
      reason,
    },
    reportedHostname: hostname,
  };
}
interface ReportContext {
  runtime: PreferenceRuntime;
  clientInfo: { type: string; [key: string]: unknown };
  acquireAuthority(): {
    observeContent(url: unknown): { assert(): Promise<unknown> };
  };
  security: { currentTabUrl(tabId: number): Promise<unknown> };
  cdp: {
    readDocumentState(
      tabId: number,
    ): Promise<{ href?: string | null } | null | undefined>;
    currentTopLevelUrl(tabId: number): string | null | undefined;
  };
}
/** Original _ne. Empty href is retained; only nullish values fall back. */
export async function botReportUrl(tabId: number, context: ReportContext) {
  return (
    (await context.cdp.readDocumentState(tabId))?.href ??
    context.cdp.currentTopLevelUrl(tabId)
  );
}
/** Original fF. dt emission is required explicitly; runtime telemetry bootstrap remains separate. */
export function createTabBotDetectionReportCommand(
  emit: (
    runtime: PreferenceRuntime,
    name: string,
    value: string,
    metadata: ReturnType<typeof botDetectionEvent>["metadata"],
    clientInfo: ReportContext["clientInfo"],
  ) => unknown,
) {
  return defineCommand(
    BotDetectionReport,
    async (payload: unknown, context: ReportContext) => {
      await context
        .acquireAuthority()
        .observeContent(
          await context.security.currentTabUrl(Number((payload as any).tab_id)),
        )
        .assert();
      const parsed = BotDetectionReport.PayloadSchema.parse(payload),
        tabId = positiveTabId(parsed.tab_id);
      const backend = (
        {
          cdp: "cdp",
          extension: "chrome",
          iab: "iab",
          mcpapps: "mcpapps",
        } as Record<string, string>
      )[context.clientInfo.type];
      const event = botDetectionEvent({
        backend,
        reason: parsed.reason,
        turnMetadata: codexTurnMetadata(context.runtime),
        url: await botReportUrl(tabId, context),
      });
      emit(
        context.runtime,
        event.name,
        event.value,
        event.metadata,
        context.clientInfo,
      );
      return { status: "reported", hostname: event.reportedHostname };
    },
  );
}

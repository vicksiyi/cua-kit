import { WebMcpListTools } from "../../commands/web_mcp";
import {
  toWebMcpToolDescriptor,
  type WebMcpToolRecord,
} from "../../capabilities/tab_web_mcp";
import type { WebMcpCommandContext } from "../commands/web_mcp";
import { pendingWebMcpTabs } from "./host";
import { staleWebMcpRegistration } from "./frame_discovery";
import { assertWebMcpSupported } from "./support";
import {
  assertWebMcpPageEnabled,
  rememberWebMcpTools,
  webMcpDescriptorIdentity,
  pollWebMcpSessionTab,
} from "./session_catalog";
import {
  createWebMcpToolDirectory,
  type WebMcpDirectoryDependencies,
} from "./tool_directory";
/** Original aA. Do not coerce event versions or tab identifiers. */
export function isWebMcpChangedEvent(event: any) {
  return (
    event.version === 1 &&
    event.type === "webmcp_changed" &&
    Number.isInteger(event.tabId) &&
    event.tabId > 0
  );
}
/** Original $ue. Announced names are callable names, not descriptive tool names. */
export function formatWebMcpToolsNotification(
  tabId: number,
  tools: WebMcpToolRecord[],
) {
  return [
    `WebMCP tools are available in tab ${tabId}:`,
    "",
    "```json",
    JSON.stringify(
      tools
        .map(toWebMcpToolDescriptor)
        .map(({ call_name, ...descriptor }) => ({
          ...descriptor,
          name: call_name,
        })),
    ),
    "```",
  ].join("\n");
}
/** Original i6/s6/_x/Wue; the factory owns the same per-context pending-poll scope. */
export function createWebMcpNotifications(
  dependencies: Omit<WebMcpDirectoryDependencies, "assertSupported">,
) {
  const directory = createWebMcpToolDirectory({
    ...dependencies,
    assertSupported: (command, context) =>
      assertWebMcpSupported(command, context as WebMcpCommandContext),
  });
  const pendingPolls = new WeakMap<WebMcpCommandContext, Promise<void>>();
  async function refreshTab(
    context: WebMcpCommandContext,
    tabId: number,
    deadlineMs: number,
    retry = true,
  ): Promise<string> {
    if (Date.now() >= deadlineMs) return "";
    try {
      await assertWebMcpSupported(WebMcpListTools.commandType, context);
      if (Date.now() >= deadlineMs) return "";
      const url = await assertWebMcpPageEnabled(context, tabId);
      if (Date.now() >= deadlineMs) return "";
      await context
        .acquireAuthority()
        .useWebMcp(url, { type: WebMcpListTools.commandType }, tabId)
        .assert();
      const result = await directory(context, tabId, deadlineMs);
      if (Date.now() >= deadlineMs) return "";
      const previous = rememberWebMcpTools(context, tabId, result),
        identity = webMcpDescriptorIdentity(result.tools);
      return previous === identity ||
        (previous == null && result.tools.length === 0)
        ? ""
        : result.tools.length === 0
          ? `WebMCP tools are no longer available in tab ${tabId}.`
          : formatWebMcpToolsNotification(tabId, result.tools);
    } catch (error) {
      return retry &&
        error instanceof Error &&
        error.message.includes(staleWebMcpRegistration)
        ? await refreshTab(context, tabId, deadlineMs, false)
        : "";
    }
  }
  async function collect(
    pageEvents: any[],
    lifecycleEvents: any[],
    context: WebMcpCommandContext,
    deadlineMs: number,
  ) {
    if (Date.now() >= deadlineMs) return [];
    const tabs = new Set<number>(
      pageEvents.filter(isWebMcpChangedEvent).map(({ tabId }) => tabId),
    );
    for (const tabId of pendingWebMcpTabs(
      context.cdp,
      context.getCurrentSessionId(),
    ))
      tabs.add(tabId);
    for (const event of lifecycleEvents)
      if (event.type === "tab_acquired" && event.origin === "external")
        tabs.add(event.tabId);
    const deadline =
      tabs.size === 0 ? Math.min(deadlineMs, Date.now() + 250) : deadlineMs;
    const messages = new Map<number, string>();
    const refresh = async () => {
      await Promise.all(
        [...tabs].map(async (tabId) => {
          const message = await refreshTab(context, tabId, deadline);
          if (Date.now() < deadline && message.length > 0)
            messages.set(tabId, message);
        }),
      );
    };
    const run = async () => {
      if (tabs.size > 0) return refresh();
      if (pendingPolls.has(context)) return;
      const pending = (async () => {
        const polled = await pollWebMcpSessionTab(context);
        if (Date.now() >= deadline) return;
        if (polled != null) tabs.add(polled);
        for (const tabId of pendingWebMcpTabs(
          context.cdp,
          context.getCurrentSessionId(),
        ))
          tabs.add(tabId);
        await refresh();
      })();
      pendingPolls.set(context, pending);
      try {
        await pending;
      } finally {
        pendingPolls.delete(context);
      }
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        run(),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, deadline - Date.now());
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    return [...tabs].flatMap((tabId) => {
      const message = messages.get(tabId);
      return message == null ? [] : [message];
    });
  }
  return { collect, refreshTab };
}

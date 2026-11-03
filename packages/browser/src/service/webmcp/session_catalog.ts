import type { WebMcpToolRecord } from "../../capabilities/tab_web_mcp";
import { AuthorityGateError } from "../errors/authority_gate_error";
import {
  assertWebMcpGeneration,
  findWebMcpState,
  type WebMcpCdp,
} from "./host";

export interface WebMcpCatalogContext {
  cdp: WebMcpCdp;
  getCurrentSessionId(): string;
  security: { assertWebMcpEnabled(tabId: number): Promise<string> };
}
export interface WebMcpToolSnapshot {
  generation: number;
  tools: WebMcpToolRecord[];
}
export interface WebMcpCatalogState {
  toolsBySession: Map<string, WebMcpToolSnapshot>;
  registrationChanges: number;
  disabled: boolean;
  snapshot?: { tools: WebMcpToolRecord[]; deniedOrigins: Set<string> };
}
/** Original Ya/gN/bN/yN. Nullish flag values retain the original defaults. */
export const defaultWebMcpLimits = {
  maxTools: 100,
  maxTotalDescriptorBytes: 65536,
  maxRegistrationChanges: 10,
};
export const webMcpLimitsConfigName = "codex-app-webmcp-limits";
export function webMcpLimits(
  config?: {
    get(key: string, fallback: number): number | null | undefined;
  } | null,
) {
  return {
    maxTools:
      config?.get("max_tools", defaultWebMcpLimits.maxTools) ??
      defaultWebMcpLimits.maxTools,
    maxTotalDescriptorBytes:
      config?.get(
        "max_total_descriptor_bytes",
        defaultWebMcpLimits.maxTotalDescriptorBytes,
      ) ?? defaultWebMcpLimits.maxTotalDescriptorBytes,
    maxRegistrationChanges:
      config?.get(
        "max_registration_changes",
        defaultWebMcpLimits.maxRegistrationChanges,
      ) ?? defaultWebMcpLimits.maxRegistrationChanges,
  };
}
export function webMcpDescriptorBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
export const webMcpDisabledMessage =
  "WebMCP is disabled for this page because the site’s WebMCP configuration exceeds supported limits. After correcting the configuration, reset NodeREPL and refresh the browser tab to retry.";
const catalogs = new WeakMap<
  WebMcpCatalogContext,
  Map<number, WebMcpCatalogState>
>();
const pollingOffsets = new WeakMap<WebMcpCatalogContext, number>();
/** Original EN. Top-level navigation clears page limits, without replacing per-session snapshots. */
export function ensureWebMcpCatalog(
  context: WebMcpCatalogContext,
  tabId: number,
) {
  const existing = catalogs.get(context),
    tabs = existing ?? new Map<number, WebMcpCatalogState>();
  if (existing == null) {
    context.cdp.on?.("event", (event) => {
      if (
        event.method !== "Page.frameNavigated" ||
        event.source.sessionId != null ||
        event.source.targetId != null ||
        event.params.frame.parentId != null
      )
        return;
      const state = tabs.get(event.source.tabId);
      if (state != null) {
        state.snapshot = undefined;
        state.registrationChanges = 0;
        state.disabled = false;
      }
    });
    catalogs.set(context, tabs);
  }
  const state: WebMcpCatalogState = tabs.get(tabId) ?? {
    toolsBySession: new Map(),
    registrationChanges: 0,
    disabled: false,
  };
  tabs.set(tabId, state);
  return state;
}
/** Original Oh; registration/call IDs and pageUrl do not participate in descriptor identity. */
export function webMcpDescriptorIdentity(tools: WebMcpToolRecord[]) {
  return JSON.stringify(
    tools.map((tool) => ({
      name: tool.name,
      ...(tool.title == null ? {} : { title: tool.title }),
      ...(tool.description == null ? {} : { description: tool.description }),
      inputSchema: tool.input_schema,
      ...(tool.annotations == null ? {} : { annotations: tool.annotations }),
      ...(tool.origin == null ? {} : { origin: tool.origin }),
    })),
  );
}
/** Original Dh. Clone the public result so caller mutation cannot change remembered tools. */
export function rememberWebMcpTools(
  context: WebMcpCatalogContext,
  tabId: number,
  result: WebMcpToolSnapshot,
) {
  const catalog = ensureWebMcpCatalog(context, tabId),
    state = findWebMcpState(context.cdp, tabId);
  assertWebMcpGeneration(state, result.generation);
  const sessionId = context.getCurrentSessionId();
  state!.notifiedGenerations.set(sessionId, result.generation);
  const previous = catalog.toolsBySession.get(sessionId),
    tools =
      previous?.generation === result.generation ? previous.tools : undefined;
  catalog.toolsBySession.set(sessionId, {
    generation: result.generation,
    tools: structuredClone(catalog.disabled ? [] : result.tools),
  });
  return tools != null
    ? webMcpDescriptorIdentity(tools)
    : previous != null && previous.tools.length > 0
      ? "stale"
      : undefined;
}
/** Original xN/_N. Revocation clears notifications for every session, not just the caller. */
export function clearWebMcpTabSessions(
  context: WebMcpCatalogContext,
  tabId: number,
) {
  const catalog = catalogs.get(context)?.get(tabId);
  if (catalog == null) return;
  const state = findWebMcpState(context.cdp, tabId);
  for (const session of catalog.toolsBySession.keys())
    state?.notifiedGenerations.delete(session);
  catalog.toolsBySession.clear();
}
export function clearWebMcpSessions(context: WebMcpCatalogContext) {
  for (const tabId of catalogs.get(context)?.keys() ?? [])
    clearWebMcpTabSessions(context, tabId);
}
/** Original Yi. Only configuration-gate denial invalidates session tool snapshots. */
export async function assertWebMcpPageEnabled(
  context: WebMcpCatalogContext,
  tabId: number,
) {
  try {
    return await context.security.assertWebMcpEnabled(tabId);
  } catch (error) {
    if (
      error instanceof AuthorityGateError &&
      error.gate === "webMcpConfiguration"
    )
      clearWebMcpTabSessions(context, tabId);
    throw error;
  }
}
/** Original vN. Advance before awaiting the check, including when that check rejects. */
export async function pollWebMcpSessionTab(context: WebMcpCatalogContext) {
  const catalog = catalogs.get(context);
  if (catalog == null) return;
  const tabs = [...catalog]
    .filter(([, state]) => state.toolsBySession.size > 0)
    .map(([id]) => id);
  if (tabs.length === 0) return;
  const offset = (pollingOffsets.get(context) ?? 0) % tabs.length;
  pollingOffsets.set(context, (offset + 1) % tabs.length);
  const tabId = tabs[offset];
  if (tabId != null)
    return await assertWebMcpPageEnabled(context, tabId).then(
      () => tabId,
      () => {},
    );
}
/** Original SN/Bc. Catalog presence alone never grants access across sessions or generations. */
export function assertWebMcpCatalogEnabled(
  context: WebMcpCatalogContext,
  tabId: number,
) {
  if (catalogs.get(context)?.get(tabId)?.disabled === true)
    throw new Error(webMcpDisabledMessage);
}
export function findSessionWebMcpTool(
  context: WebMcpCatalogContext,
  tabId: number,
  registrationId: string,
) {
  const state = catalogs.get(context)?.get(tabId);
  if (state == null || state.disabled) return;
  const session = state.toolsBySession.get(context.getCurrentSessionId());
  return session != null &&
    session.generation === findWebMcpState(context.cdp, tabId)?.generation
    ? session.tools.find((tool) => tool.registration_id === registrationId)
    : undefined;
}

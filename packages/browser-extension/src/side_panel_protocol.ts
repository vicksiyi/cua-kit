import { parseExtensionInstanceId, wellFormed } from "./instance_id";
export const sidePanelMessageTypes = {
  context: "browser_side_chat_context",
  contextInvalidated: "browser_side_chat_context_invalidated",
  tabContextChanged: "browser_side_chat_tab_context_changed",
  capabilities: "browser_side_chat_capabilities",
  authOpen: "CODEX_WORK_SIDE_PANEL_AUTH_OPEN",
  authState: "CODEX_WORK_SIDE_PANEL_AUTH_STATE",
} as const;
export const sidePanelCapabilities = {
  browserTabMentionsSearch: "browserTabMentions.search",
  browserSideChatOpenInBrowser: "browserSideChat.openInBrowser",
  browserSideChatTabContextRead: "browserSideChat.tabContext.read",
  browserControlStateRead: "browserControl.state.read",
  extensionUpdateRead: "extension.update.read",
  nativeHostStatus: "nativeHost.status",
  sidePanelOpen: "sidePanel.open",
  sidePanelPromptPrefill: "sidePanel.promptPrefill",
  sidePanelStateRead: "sidePanel.state.read",
  toolbarPinRead: "toolbar.pin.read",
  websiteActionRequest: "website.action.request",
} as const;
// Original guards deliberately accept inherited fields and, except the browser
// context guard, array objects with matching properties.
function object(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value != null;
}
function requestId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}
export function isSideChatAuthChanged(value: unknown) {
  return (
    object(value) &&
    value.type === "browser_side_chat_auth_state_changed" &&
    ["expired", "logout_requested", "signed_in", "signed_out"].includes(
      value.state,
    )
  );
}
export function isSideChatOpenInBrowser(value: unknown) {
  return (
    object(value) &&
    value.type === "browser_side_chat_open_in_browser" &&
    typeof value.url === "string"
  );
}
export function isSideChatPromptPrefill(value: unknown) {
  if (!object(value)) return false;
  return (
    value.type === "browser_side_chat_prompt_prefill" &&
    typeof value.createdAtMs === "number" &&
    Number.isSafeInteger(value.createdAtMs) &&
    value.createdAtMs >= 0 &&
    (value.mode === undefined ||
      (value.mode === "work" && value.selectedText === undefined)) &&
    (value.mode === "work" ||
      value.prompt !== undefined ||
      value.selectedText !== undefined) &&
    (value.prompt === undefined ||
      (typeof value.prompt === "string" &&
        value.prompt.trim().length > 0 &&
        value.prompt.length <= 8192)) &&
    (value.selectedText === undefined ||
      (typeof value.selectedText === "string" &&
        value.selectedText.trim().length > 0 &&
        value.selectedText.length <= 80000))
  );
}
export function isSideChatTabContextRequest(value: unknown) {
  return (
    object(value) &&
    value.type === "browser_side_chat_tab_context_requested" &&
    requestId(value.requestId)
  );
}
export function isSideChatContextRequest(value: unknown) {
  return (
    object(value) &&
    "type" in value &&
    value.type === "browser_side_chat_context_requested" &&
    "protocolVersion" in value &&
    value.protocolVersion === 2 &&
    "requestId" in value &&
    requestId(value.requestId) &&
    (!("includeSelection" in value) ||
      value.includeSelection === undefined ||
      typeof value.includeSelection === "boolean")
  );
}
export function isSideChatLocationChanged(value: unknown) {
  return (
    object(value) &&
    value.type === "browser_side_chat_location_changed" &&
    typeof value.url === "string"
  );
}
export function isSideChatMediaPermissionRequest(value: unknown) {
  return (
    object(value) &&
    "type" in value &&
    value.type === "browser_side_chat_media_permission_request" &&
    "audio" in value &&
    typeof value.audio === "boolean" &&
    "video" in value &&
    typeof value.video === "boolean" &&
    (value.audio || value.video)
  );
}
export function isSideChatBrowserContext(value: unknown) {
  return (
    object(value) &&
    !Array.isArray(value) &&
    (value.instanceId === null || requestId(value.instanceId))
  );
}
export function isSideChatCapabilitiesRequest(value: unknown) {
  return (
    object(value) && value.type === "browser_side_chat_capabilities_requested"
  );
}
/** Original sidepanel Je/Ze. */
export function isSidePanelAuthRevalidate(value: unknown) {
  return (
    object(value) &&
    value.type === "CODEX_WORK_SIDE_PANEL_AUTH_REVALIDATE" &&
    typeof value.ownerTabId === "number" &&
    Number.isSafeInteger(value.ownerTabId) &&
    value.ownerTabId >= 0
  );
}
/** Original X. Observation suitability is separate from browser control permission. */
export function canReadSidePanelTab(
  tab: Pick<chrome.tabs.Tab, "id" | "incognito" | "url">,
): tab is Pick<chrome.tabs.Tab, "id" | "incognito" | "url"> & {
  id: number;
  url: string;
} {
  if (
    tab.incognito ||
    !(
      Number.isSafeInteger(tab.id) &&
      (tab.id ?? -1) >= 0 &&
      typeof tab.url === "string" &&
      tab.url.length <= 16384 &&
      wellFormed(tab.url)
    )
  )
    return false;
  try {
    const protocol = new URL(tab.url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
/** Original ve, sharing exact xt/gc instance-id validation. */
export async function readSidePanelInstanceId(
  runtime: Pick<typeof chrome.runtime, "sendMessage">,
) {
  const value = await runtime.sendMessage({
    type: "GET_EXTENSION_INSTANCE_ID",
  });
  return object(value) && "instanceId" in value
    ? parseExtensionInstanceId(value.instanceId)
    : null;
}

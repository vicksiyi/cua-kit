import { captureTabScreenshot } from "../commands/screenshot";
import { commandScheduling } from "./command_scheduler";
import type { CommandOutcome } from "./command_recorders";
function httpUrl(value: any) {
  if (value != null)
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:"
        ? url
        : undefined;
    } catch {}
}
/** Original bx: keep the path, remove credentials, query and fragment. */
export function responseUrl(value: any) {
  const url = httpUrl(value);
  if (url != null) {
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.href;
  }
}
function parameterUrl(params: any) {
  if (typeof params !== "object" || params == null || Array.isArray(params))
    return;
  const value = params.url;
  return typeof value === "string" && value.length > 0
    ? responseUrl(value)
    : undefined;
}
/** Original Tue/bu. Select only supported surface detail fields. */
export function emitResponseMetadata(
  runtime: any,
  backend: string,
  details: any,
) {
  const surface: any = {};
  for (const key of [
    "browserId",
    "browserFamily",
    "extensionInstanceId",
    "manualHandoffTabId",
    "openTabIds",
    "openTabs",
    "sessionEnded",
    "screenshot",
    "webMcpCalls",
  ])
    if (details[key] != null) surface[key] = details[key];
  const url =
    responseUrl(details.currentUrl) ?? parameterUrl(details.params ?? {});
  const meta: any = {
    "codex/browserUse": true,
    "codex/toolSurface": { kind: "browserUse", backend, ...surface },
    browser_use: url != null ? { url } : {},
  };
  if (details.cloudBrowserHandoff != null)
    meta.cloud_browser_handoff = { ...details.cloudBrowserHandoff };
  runtime.setResponseMeta(meta);
}
function responseTabId(value: any) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}
/** Original $3: tab-list and screenshot failures are isolated and observation state is rechecked. */
export function createResponseScreenshot(
  emitEvent: (...args: any[]) => void,
  canObserve: (context?: any) => boolean = commandScheduling.canObserve,
  capture: typeof captureTabScreenshot = captureTabScreenshot,
) {
  return async function captureResponseScreenshot({
    backend,
    commandSucceeded,
    commandType,
    context,
    params,
    result,
    runtime,
  }: CommandOutcome) {
    const details: any = {
      browserId: context.browserId,
      browserFamily: context.clientInfo.family,
    };
    if (!canObserve(context)) return details;
    const instance = context.clientInfo.metadata?.extensionInstanceId;
    if (backend === "chrome" && instance)
      details.extensionInstanceId = instance;
    let tabs: any[] = [],
      controlled: any[] = [],
      active: any;
    try {
      tabs = await context.tabs.list();
      controlled = tabs.filter((tab) => tab.sessionControlled !== false);
      details.openTabIds = controlled.map((tab) => String(tab.id));
      if (backend === "chrome")
        details.openTabs = controlled.map((tab) => ({
          faviconUrl: responseUrl(tab.faviconUrl),
          id: tab.id,
          title: tab.title?.trim() || undefined,
          url: httpUrl(tab.url)?.origin,
        }));
      active = controlled.find((tab) => tab.active);
    } catch (error) {
      const reason =
        error instanceof Error ? error.name || "Error" : typeof error;
      emitEvent(
        runtime,
        "browser_use_response_meta_tabs_failed",
        reason,
        { backend, commandType, phase: "response-meta-tabs" },
        context.clientInfo,
      );
    }
    if (!canObserve(context)) return details;
    try {
      const resultId =
        typeof result === "object" && result != null
          ? Reflect.get(result, "id")
          : undefined;
      let tabId = responseTabId(params.tab_id) ?? responseTabId(resultId);
      if (commandSucceeded && commandType === "close_tab") tabId = undefined;
      if (context.clientInfo.discoveryScope === "session") {
        active =
          tabId == null
            ? (active ?? controlled[0])
            : controlled.find((tab) => tab.id === tabId);
        if (active == null)
          return canObserve(context)
            ? details
            : {
                browserId: context.browserId,
                browserFamily: context.clientInfo.family,
              };
        tabId = active.id;
      } else if (tabId == null) {
        active ??= await context.tabs.getActive();
        tabId = active.id;
      }
      const screenshot = await capture(
        { tab_id: String(tabId) },
        context,
        "device",
      );
      const page = httpUrl(
        tabs.find((tab) => tab.id === tabId)?.url ??
          (active?.id === tabId ? active.url : undefined),
      );
      details.screenshot = {
        tabId: String(tabId),
        url: `data:image/jpeg;base64,${screenshot.data}`,
        ...(page == null
          ? {}
          : { pageUrl: `${page.protocol}//${page.hostname}` }),
      };
    } catch (error) {
      const reason =
        error instanceof Error ? error.name || "Error" : typeof error;
      emitEvent(
        runtime,
        "browser_use_response_meta_screenshot_failed",
        reason,
        { backend, commandType, phase: "response-meta-screenshot" },
        context.clientInfo,
      );
    }
    return canObserve(context)
      ? details
      : {
          browserId: context.browserId,
          browserFamily: context.clientInfo.family,
        };
  };
}

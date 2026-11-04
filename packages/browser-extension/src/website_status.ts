import { isChatGptPageSender } from "./tab_mention_messages";
const installerUrlRegex = String.raw`^https://(persistent\.oaistatic\.com/codex-app-prod/ChatGPT(-latest-x64)?\.dmg|get\.microsoft\.com/installer/download/9PLM9XGG6VKS\?cid=website_cta_psi)$`;
/** Original kf/sk/ak. Existing downloads are queried; this code never initiates one. */
export function createInstallerStatus(
  chromeApi: Pick<typeof chrome, "downloads" | "runtime">,
) {
  const readDownload = async () => {
    const [download] = await chromeApi.downloads.search({
      limit: 1,
      orderBy: ["-startTime"],
      urlRegex: installerUrlRegex,
    });
    return download;
  };
  async function readStatus() {
    const download = await readDownload();
    return download?.exists === false ||
      download?.state === "interrupted" ||
      download?.paused === true
      ? { status: "idle" }
      : download?.state === "complete"
        ? { status: "downloaded" }
        : download?.state !== "in_progress"
          ? { status: "idle" }
          : {
              progressPercent:
                download.totalBytes > 0
                  ? Math.min(
                      Math.floor(
                        (download.bytesReceived / download.totalBytes) * 100,
                      ),
                      99,
                    )
                  : null,
              status: "downloading",
            };
  }
  function handleShow(
    message: any,
    sender: chrome.runtime.MessageSender,
    channel: string,
  ) {
    if (
      typeof message !== "object" ||
      message == null ||
      !("type" in message) ||
      message.type !== "SHOW_CODEX_INSTALLER" ||
      !isChatGptPageSender(sender, channel, chromeApi.runtime.id)
    )
      return false;
    readDownload()
      .then((download) => {
        if (download?.exists !== false && download?.state === "complete")
          chromeApi.downloads.show(download.id);
      })
      .catch(() => {});
    return true;
  }
  return { readDownload, readStatus, handleShow };
}
interface StatusTransport {
  refreshStatus(): {
    errorType?: unknown;
    lastChecked?: unknown;
    state: string;
  };
}
/** Original vk. Each async status source has its own single-flight/retry closure. */
export function createWebsiteStatusHandler(host: {
  chrome: typeof chrome;
  instanceId(): Promise<string>;
  isBrowserControlActive(): boolean;
  readInstallerStatus(): Promise<unknown>;
  reportMetric(
    name: string,
    value: number,
    metadata: { surface: string; stage: string },
  ): void;
}) {
  return function handleStatusPort(
    transport: StatusTransport,
    version: string,
    channel: string,
    port: chrome.runtime.Port,
  ) {
    if (port.name !== "chatgpt-extension-status") return;
    const sender = port.sender,
      tabId = sender?.tab?.id;
    if (
      sender == null ||
      typeof tabId !== "number" ||
      !isChatGptPageSender(sender, channel, host.chrome.runtime.id)
    ) {
      port.disconnect();
      return;
    }
    const status: any = {};
    let closed = false;
    const cleanup = () => {
      if (!closed) {
        closed = true;
        port.onDisconnect.removeListener(cleanup);
        port.onMessage.removeListener(onMessage);
        port.disconnect();
      }
    };
    const publish = () => {
      if (!closed)
        try {
          port.postMessage({ type: "update", status });
        } catch {
          cleanup();
        }
    };
    const singleFlight = <T>(
      read: () => Promise<T>,
      apply: (value: T) => void,
      failed?: () => void,
    ) => {
      let pending = false;
      return () => {
        if (closed || pending) return;
        pending = true;
        const complete = () => {
          pending = false;
          publish();
        };
        Promise.resolve()
          .then(read)
          .catch((error) => {
            if (closed) throw error;
            return read();
          })
          .then((value) => {
            if (!closed) apply(value);
          })
          .then(complete, () => {
            if (!closed) failed?.();
            complete();
          });
      };
    };
    const identity = singleFlight(
      host.instanceId,
      (instanceId) => {
        status.browserContext = { instanceId };
      },
      () =>
        host.reportMetric(
          "codex_chrome_extension_browser_context_setup_failure",
          1,
          { surface: "website", stage: "instance_id" },
        ),
    );
    const opened = singleFlight(
      () =>
        host.chrome.storage.local.get("lastSeenExtensionActionCalloutVersion"),
      (stored) => {
        const value = stored.lastSeenExtensionActionCalloutVersion;
        status.sidePanel = {
          ...status.sidePanel,
          hasEverOpened: typeof value === "number" && value > 0,
        };
      },
    );
    const windowState = singleFlight(
      () =>
        Promise.all([
          host.chrome.storage.session.get([
            "codexSidePanelOpenWindowIds",
            "codexPendingUpdateVersion",
          ]),
          host.chrome.tabs.get(tabId),
        ]),
      ([stored, tab]) => {
        const value = stored.codexSidePanelOpenWindowIds;
        const windowIds = Array.isArray(value)
          ? new Set(
              value.filter(
                (id) => typeof id === "number" && Number.isSafeInteger(id),
              ),
            )
          : new Set();
        status.sidePanel = {
          ...status.sidePanel,
          currentWindow: windowIds.has(tab.windowId) ? "open" : "closed",
        };
        status.extension = {
          ...status.extension,
          updateAvailable:
            typeof stored.codexPendingUpdateVersion === "string" &&
            stored.codexPendingUpdateVersion !== version,
        };
      },
    );
    const toolbar = singleFlight(
      () => host.chrome.action.getUserSettings(),
      (settings) => {
        status.toolbar = { pin: settings.isOnToolbar ? "pinned" : "unpinned" };
      },
    );
    const installer = singleFlight(host.readInstallerStatus, (value) => {
      status.installer = value;
    });
    const refresh = () => {
      if (closed) return;
      const native = transport.refreshStatus();
      const hasSidePanel = typeof host.chrome.sidePanel?.open === "function";
      status.capabilities = {
        "browserTabMentions.search": true,
        "browserControl.state.read": true,
        "extension.update.read": true,
        "nativeHost.status": true,
        ...(hasSidePanel
          ? {
              "sidePanel.open": true,
              "sidePanel.promptPrefill": true,
              "sidePanel.state.read": true,
            }
          : {}),
        "toolbar.pin.read": true,
        "website.action.request": true,
      };
      status.extension = { ...status.extension, channel, version };
      status.browserControl = {
        phase: host.isBrowserControlActive() ? "active" : "idle",
      };
      status.nativeHost = {
        errorType: native.errorType,
        lastCheckedAt: native.lastChecked,
        transport: native.state,
      };
      identity();
      opened();
      windowState();
      toolbar();
      if (native.state !== "connected") installer();
      publish();
    };
    const onMessage = (message: any) => {
      if (message?.type === "refresh") refresh();
    };
    port.onDisconnect.addListener(cleanup);
    port.onMessage.addListener(onMessage);
    refresh();
  };
}

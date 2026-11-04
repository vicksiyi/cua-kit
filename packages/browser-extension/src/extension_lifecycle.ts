import type { createSiwcServiceClass } from "./siwc";
type AuthReader = ReturnType<
  ReturnType<typeof createSiwcServiceClass>["createCachedAuthReader"]
>;
/** Restored Hk/yk. Full background startup still owns constructing the installation service. */
export function registerExtensionLifecycle(
  host: {
    chrome: Pick<typeof chrome, "runtime" | "webNavigation" | "tabs">;
    scope: Pick<EventTarget, "addEventListener" | "removeEventListener">;
    browserFamily(): string;
    createAuthReader(): AuthReader;
    refreshAuth(reader: AuthReader): Promise<unknown>;
    refreshWebsite(channel: string, notify: boolean): Promise<unknown>;
    reportToolbar(trigger: string): void;
    registerContextMenu(): void;
    reportMetric(
      name: string,
      value: number,
      tags: Record<string, string>,
    ): Promise<unknown>;
    warn(message: string): void;
  },
  options: {
    buildChannel: string;
    sidePanelEnabled: boolean;
    browserPluginInstallation: {
      refresh(reader?: AuthReader): void;
      stop(): void;
    };
  },
) {
  const { buildChannel, sidePanelEnabled, browserPluginInstallation } = options;
  async function showInstalledPage(details: chrome.runtime.InstalledDetails) {
    if (details.reason !== "install" || host.browserFamily() === "opera")
      return;
    await host.chrome.tabs.create({
      active: true,
      url: "https://chatgpt.com/work/extension/installed",
    });
  }
  const installed = (details: chrome.runtime.InstalledDetails) => {
    showInstalledPage(details).catch(() => {});
    if (details.reason === "install")
      host
        .reportMetric("codex_browser_extension_installed", 1, {})
        .catch(() =>
          host.warn("Failed to report Chrome extension installation."),
        );
    if (sidePanelEnabled) {
      if (details.reason === "install" || details.reason === "update")
        host.reportToolbar(details.reason);
      host.registerContextMenu();
    }
  };
  const startup = () => {
    browserPluginInstallation.refresh();
    if (sidePanelEnabled) host.reportToolbar("startup");
  };
  const completed = (
    details: chrome.webNavigation.WebNavigationFramedCallbackDetails,
  ) => {
    if (
      details.frameId === 0 &&
      new URL(details.url).origin === "https://chatgpt.com"
    ) {
      const reader = host.createAuthReader();
      browserPluginInstallation.refresh(reader);
      host.refreshAuth(reader).catch(() => {});
    }
  };
  const activated = () => browserPluginInstallation.refresh();
  host.scope.addEventListener("activate", activated);
  host.chrome.runtime.onInstalled.addListener(installed);
  host.chrome.runtime.onStartup.addListener(startup);
  host.chrome.webNavigation.onCompleted.addListener(completed, {
    url: [{ hostEquals: "chatgpt.com" }],
  });
  host.refreshWebsite(buildChannel, false).catch(() => {});
  return () => {
    host.scope.removeEventListener("activate", activated);
    host.chrome.runtime.onInstalled.removeListener(installed);
    host.chrome.runtime.onStartup.removeListener(startup);
    host.chrome.webNavigation.onCompleted.removeListener(completed);
    browserPluginInstallation.stop();
  };
}

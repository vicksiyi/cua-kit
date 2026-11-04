import { SIDE_PANEL_PATH } from "./side_panel_tabs";
/** Original Ok/Ff/Pk. Registration intentionally has no invented idempotence guard. */
export function createSidePanelEntrypoints(host: {
  chrome: Pick<
    typeof chrome,
    "sidePanel" | "action" | "tabs" | "runtime" | "commands"
  >;
  showCallout(): Promise<unknown>;
  registerWindowEvents(): void;
  registerContextMenu(): void;
  isOpen(windowId: number, tabId?: number): boolean;
  toggle(tab: chrome.tabs.Tab | undefined, source: string): Promise<unknown>;
  reportOpen(source: string): void;
}) {
  function registerIcon() {
    host.chrome.action.onClicked.addListener((tab) => {
      if (typeof host.chrome.sidePanel?.open !== "function") {
        host.chrome.tabs
          .create({ url: host.chrome.runtime.getURL(SIDE_PANEL_PATH) })
          .then(() => {
            host.reportOpen("icon");
          })
          .catch(() => {});
        return;
      }
      if (!(tab.windowId != null && host.isOpen(tab.windowId, tab.id)))
        host.toggle(tab, "icon").catch(() => {});
    });
  }
  function registerShortcut() {
    host.chrome.commands.onCommand.addListener((command, tab) => {
      if (command === "open-codex-side-panel")
        host.toggle(tab, "keyboard_shortcut").catch(() => {});
    });
  }
  function register() {
    if (host.chrome.sidePanel == null) {
      registerIcon();
      return;
    }
    host.showCallout().catch(() => {});
    host.registerWindowEvents();
    registerIcon();
    registerShortcut();
    host.registerContextMenu();
  }
  return { register, registerIcon, registerShortcut };
}

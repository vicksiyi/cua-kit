import { filterCdpEvent, type CdpEvent } from "./cdp_security";
export interface BrowserEventPeer {
  sendCdpDetach(source: chrome.debugger.Debuggee): void;
  sendCdpEvent(event: CdpEvent): void;
  sendDownloadChange(change: unknown): void;
}
export interface BrowserEventHandler {
  addDownloadChangeListener(listener: (change: any) => void): unknown;
  handleDownloadCreated(download: chrome.downloads.DownloadItem): void;
  handleDownloadChanged(change: chrome.downloads.DownloadDelta): void;
  handleCreatedNavigationTarget(
    details: chrome.webNavigation.WebNavigationSourceCallbackDetails,
  ): Promise<unknown>;
}
/** Listener portion of original dR. Broadcast routing and instance initialization belong to startup. */
export function registerBrowserEventListeners(
  chromeApi: Pick<typeof chrome, "debugger" | "downloads" | "webNavigation">,
  handler: BrowserEventHandler,
  broadcast: (send: (peer: BrowserEventPeer) => void) => void,
): void {
  chromeApi.debugger.onDetach.addListener((source) => {
    broadcast((peer) => peer.sendCdpDetach(source));
  });
  chromeApi.debugger.onEvent.addListener((source, method, params) => {
    const event = filterCdpEvent({ source, method, params });
    if (event != null) broadcast((peer) => peer.sendCdpEvent(event));
  });
  handler.addDownloadChangeListener((change) => {
    broadcast((peer) => peer.sendDownloadChange(change));
  });
  chromeApi.downloads.onCreated.addListener((download) => {
    handler.handleDownloadCreated(download);
  });
  chromeApi.downloads.onChanged.addListener((change) => {
    handler.handleDownloadChanged(change);
  });
  chromeApi.webNavigation.onCreatedNavigationTarget.addListener((details) => {
    handler.handleCreatedNavigationTarget(details).catch(() => {});
  });
}

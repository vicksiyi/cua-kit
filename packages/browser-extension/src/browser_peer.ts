import {
  createBrowserRpcPeerClass,
  type BrowserRpcTransport,
} from "@core/core/browserRpcPeer";
export interface ExtensionBrowserHandler {
  moveMouse(params: any): unknown;
  [key: string]: any;
}
export interface ExtensionBrowserPeerOptions {
  onMoveMouseError?(error: unknown, params: any): void;
  onWebMcpToolInvoked?(params: any): void;
}
const ExtensionRpcPeer = createBrowserRpcPeerClass(false);
/** Original pc: extension-side browser RPC facade over the shared fc/to peer. */
export class ExtensionBrowserPeer extends ExtensionRpcPeer {
  constructor(
    transport: BrowserRpcTransport,
    public handler: ExtensionBrowserHandler,
    public options: ExtensionBrowserPeerOptions = {},
  ) {
    super(transport);
    this.registerRequestHandlerObject(handler);
    this.addEventListener("moveMouse", (params) => {
      // Preserve the original distinction: synchronous throws escape; rejected promises are reported.
      Promise.resolve(this.handler.moveMouse(params)).catch((error) => {
        this.options.onMoveMouseError?.(error, params);
      });
    });
    this.addEventListener("webMcpToolInvoked", (params) => {
      this.options.onWebMcpToolInvoked?.(params);
    });
  }
  ping() {
    return this.sendRequest("ping");
  }
  sendCdpEvent(params: unknown) {
    this.sendNotification("onCDPEvent", params);
  }
  sendCdpDetach(params: unknown) {
    this.sendNotification("onCDPDetach", params);
  }
  sendDownloadChange(params: unknown) {
    this.sendNotification("onDownloadChange", params);
  }
  sendPageEvent(params: unknown) {
    this.sendNotification("onPageEvent", params);
  }
  sendBrowserTabMentionsInvalidated() {
    try {
      this.sendNotification("onBrowserTabMentionsInvalidated");
    } catch {}
  }
}

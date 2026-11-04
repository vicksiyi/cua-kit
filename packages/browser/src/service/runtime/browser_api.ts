import { BrowserRpcPeer } from "./rpc_peer";
import { metadataSession } from "../preferences/request_context";
import { validateRequestHeaders } from "./request_headers";
const cachedExpressionMethod = "executeCdpWithCachedExpression";
const missingCachedExpressionHandler = `No handler registered for method: ${cachedExpressionMethod}`;
/** Reconstructed original id; preserves all provider/session and cached-expression branches. */
export class BrowserApi extends BrowserRpcPeer {
  constructor(
    transport: any,
    clientHandlers: any,
    getTurnMetadata: any,
    turnEndedTracker: any,
    readRequestHeaders: any,
    browserSurface: any,
    assertAccess: any,
  ) {
    super(transport);
    this.apiTransport = transport;
    this.getTurnMetadata = getTurnMetadata;
    this.turnEndedTracker = turnEndedTracker;
    this.readRequestHeaders = readRequestHeaders;
    this.browserSurface = browserSurface;
    this.assertAccess = assertAccess;
    (this.registerRequestHandlerObject(clientHandlers),
      this.addEventListener("onPageEvent", (event: any) => {
        this.pendingPageEvents.push(event);
      }));
  }
  apiTransport: any;
  getTurnMetadata: any;
  turnEndedTracker: any;
  readRequestHeaders: any;
  browserSurface: any;
  assertAccess: any;
  detachTurn: any;
  lastSessionParams: any = null;
  clientInfo: any;
  cachedExpressionSupport: any;
  committedTabUrlSupported = true;
  sentCachedExpressions = new Set<string>();
  pendingPageEvents: any[] = [];
  endingTurnId: any;
  dotTurnCleanup: any;
  dotInfoRequest: any;
  preparingRequests: any = new Set();
  addEventListener: any = super.addEventListener;
  ping(): any {
    return this.sendRequest("ping");
  }
  executeCdp(input: any): any {
    return this.sendSessionRequest("executeCdp", input);
  }
  browserAuthNewTargetProtection(input: any): any {
    return this.sendSessionRequest("browserAuthNewTargetProtection", input);
  }
  sendWebMcpToolInvoked(input: any): any {
    (this.assertAccess?.(),
      this.sendNotification("webMcpToolInvoked", {
        ...input,
        ...this.getSessionParams(),
      }));
  }
  async executeCdpWithCachedExpression(
    request: any,
    cacheKey: any,
  ): Promise<any> {
    if (
      this.cachedExpressionSupport == null ||
      (await this.cachedExpressionSupport)
    ) {
      let commandParams = { ...request.commandParams };
      this.sentCachedExpressions.has(cacheKey) &&
        delete commandParams.expression;
      let pending = this.sendSessionRequest(cachedExpressionMethod, {
        ...request,
        commandParams: commandParams,
        expressionCacheKey: cacheKey,
      });
      (this.sentCachedExpressions.add(cacheKey),
        this.cachedExpressionSupport == null &&
          (this.cachedExpressionSupport = pending.then(
            () => !0,
            (response: any) => response !== missingCachedExpressionHandler,
          )));
      try {
        let response = await pending;
        if (response.kind === "executed") return response.result;
        let refill = await this.sendSessionRequest(cachedExpressionMethod, {
          ...request,
          expressionCacheKey: cacheKey,
        });
        if (refill.kind === "executed") return refill.result;
        throw new Error("Cached CDP expression refill failed");
      } catch (response) {
        if (response !== missingCachedExpressionHandler) throw response;
      }
    }
    return this.executeCdp(request);
  }
  allowDownload(input: any): any {
    return this.sendSessionRequest("allowDownload", input);
  }
  async supportsBlobDownloads(): Promise<any> {
    return (
      (this.clientInfo ?? (await this.getInfo())).blobDownloadsSupported === !0
    );
  }
  setBlobDownloadOrigin(input: any, value: any): any {
    return this.sendSessionRequest(
      "setBlobDownloadOrigin",
      value == null
        ? { tabId: input, origin: null }
        : { tabId: input, ...value },
    );
  }
  matchesCurrentSessionId(input: any): any {
    let value = metadataSession(this.getTurnMetadata());
    return typeof value == "string"
      ? value === input
      : this.lastSessionParams?.session_id === input;
  }
  getCurrentSessionId(): any {
    return this.getSessionParams().session_id;
  }
  getCurrentTurnId(): any {
    let input = this.getTurnMetadata();
    if (!(
      typeof metadataSession(input) != "string" ||
      typeof input?.turn_id != "string"
    ))
      return input.turn_id;
  }
  takePageEvents(): any {
    return this.pendingPageEvents.splice(0);
  }
  attach(input: any, value: any): any {
    return this.sendSessionRequest("attach", {
      tabId: input,
      networkPolicy: value,
    });
  }
  attachBrowserUseNetworkPolicy(input: any, value: any): any {
    return this.sendSessionRequest("attachBrowserUseNetworkPolicy", {
      tabId: input,
      policy: value,
    });
  }
  detachBrowserUseNetworkPolicy(input: any): any {
    return this.sendSessionRequest("detachBrowserUseNetworkPolicy", {
      tabId: input,
    });
  }
  attachTarget(input: any, value: any): any {
    return this.sendSessionRequest("attachTarget", {
      tabId: input,
      targetId: value,
    });
  }
  detach(input: any): any {
    return this.sendSessionRequest("detach", { tabId: input });
  }
  detachTarget(input: any, value: any): any {
    return this.sendSessionRequest("detachTarget", {
      tabId: input,
      targetId: value,
    });
  }
  getTabs(): any {
    return this.sendSessionRequest("getTabs", {});
  }
  async getCommittedTabUrl(tabId: any): Promise<any> {
    if (this.committedTabUrlSupported)
      try {
        return await this.sendSessionRequest("getCommittedTabUrl", {
          tabId: tabId,
        });
      } catch (response) {
        if (response !== "No handler registered for method: getCommittedTabUrl")
          throw response;
        this.committedTabUrlSupported = !1;
      }
    switch ((this.clientInfo ?? (await this.getInfo())).type) {
      case "cdp": {
        let { frameTree: response } = await this.executeCdp({
          target: { tabId: tabId },
          method: "Page.getFrameTree",
          commandParams: {},
        });
        return response.frame.url;
      }
      case "iab": {
        let { targetInfo: response } = await this.executeCdp({
          target: { tabId: tabId },
          method: "Target.getTargetInfo",
          commandParams: {},
        });
        return response.url;
      }
      case "extension": {
        let response = (await this.getTabs()).find(
          (tab: any) => tab.id === tabId,
        );
        if (response == null) throw new Error(`Tab not found: ${tabId}`);
        return response.url;
      }
    }
  }
  getUserTabs(): any {
    return this.sendSessionRequest("getUserTabs", {});
  }
  getUserHistory(input: any): any {
    return this.sendSessionRequest("getUserHistory", input);
  }
  executeTabRead(input: any): any {
    return this.sendSessionRequest("executeTabRead", input);
  }
  claimUserTab(input: any): any {
    return this.sendSessionRequest("claimUserTab", { tabId: input });
  }
  createTab(input: any): any {
    return this.sendSessionRequest(
      "createTab",
      input == null ? {} : { preferredWindowId: input },
    );
  }
  markTab(input: any, value: any): any {
    return this.sendSessionRequest("markTab", { tabId: input, status: value });
  }
  nameSession(input: any): any {
    return this.sendSessionRequest("nameSession", { name: input });
  }
  async followSessionTab(input: any, value: any = "activity"): Promise<any> {
    return this.clientInfo?.sessionTabForegroundEnabled !== !0
      ? !1
      : await this.sendSessionRequest("followSessionTab", {
          tabId: input,
          reason: value,
        });
  }
  executeUnhandledCommand(input: any): any {
    return this.sendSessionRequest("executeUnhandledCommand", input);
  }
  moveMouse(input: any): any {
    return this.sendSessionRequest("moveMouse", input);
  }
  async getInfo(): Promise<any> {
    if (this.browserSurface !== "dot")
      return (
        (this.clientInfo = await this.sendSessionRequest("getInfo", {})),
        this.clientInfo
      );
    let params = this.getSessionParams();
    if (
      (this.assertAccess?.(),
      this.dotInfoRequest?.params.session_id === params.session_id &&
        this.dotInfoRequest.params.turn_id === params.turn_id)
    )
      return this.dotInfoRequest.result;
    this.dotTurnCleanup = void 0;
    let pending = this.sendSessionRequest("getInfo", {}).then((info: any) => {
        if ((this.assertAccess?.(), !this.matchesCurrentTurn(params)))
          throw new Error("The browser turn changed while preparing Dot.");
        return ((this.clientInfo = info), info);
      }),
      entry = { params: params, result: pending };
    return (
      (this.dotInfoRequest = entry),
      pending.catch(() => {
        this.dotInfoRequest === entry && (this.dotInfoRequest = void 0);
      }),
      pending
    );
  }
  turnEnded: any = (input: any) => {
    let value = this.dotInfoRequest?.params ?? this.lastSessionParams;
    if (
      this.browserSurface === "dot" &&
      value?.session_id === input.session_id &&
      value.turn_id === input.turn_id
    ) {
      if (this.dotTurnCleanup != null) return this.dotTurnCleanup;
      let result = this.sendTurnEnded(input);
      return ((this.dotTurnCleanup = result.catch(() => {})), result);
    }
    return this.sendTurnEnded(input);
  };
  async sendTurnEnded(turn: any): Promise<any> {
    for (let preparation of this.preparingRequests)
      preparation.params.session_id === turn.session_id &&
        preparation.params.turn_id === turn.turn_id &&
        (preparation.ended = !0);
    try {
      if (this.detachTurn != null && this.matchesCurrentTurn(turn)) {
        this.endingTurnId = turn.turn_id;
        try {
          await this.detachTurn(() => this.matchesCurrentTurn(turn));
        } finally {
          this.endingTurnId = void 0;
        }
      }
    } finally {
      await this.sendRequest(
        "turnEnded",
        this.browserSurface == null
          ? turn
          : { ...turn, browser_surface: this.browserSurface },
      );
    }
  }
  addCloseListener(input: any): any {
    return this.apiTransport.addCloseListener?.(input) ?? (() => {});
  }
  async close(): Promise<any> {
    try {
      let input = this.dotInfoRequest?.params ?? this.lastSessionParams;
      this.browserSurface === "dot" &&
        input != null &&
        (await this.turnEnded(input));
    } finally {
      await this.apiTransport.close?.();
    }
  }
  async sendSessionRequest(method: any, request: any): Promise<any> {
    let params = this.getSessionParams();
    if (
      (this.endingTurnId !== params.turn_id && this.assertAccess?.(),
      this.browserSurface === "dot" &&
        method !== "getInfo" &&
        this.endingTurnId !== params.turn_id &&
        (await this.getInfo(),
        this.assertAccess?.(),
        !this.matchesCurrentTurn(params)))
    )
      throw new Error("The browser turn changed while preparing Dot.");
    method !== "getInfo" &&
      method !== "getUserTabs" &&
      ((this.lastSessionParams?.session_id !== params.session_id ||
        this.lastSessionParams.turn_id !== params.turn_id) &&
        (this.dotTurnCleanup = void 0),
      (this.lastSessionParams = params));
    let preparation = { params: params, ended: !1 };
    this.preparingRequests.add(preparation);
    try {
      if (
        ((this.clientInfo != null || this.browserSurface === "dot") &&
          this.turnEndedTracker != null &&
          this.endingTurnId !== params.turn_id &&
          this.turnEndedTracker.track(
            { session_id: params.session_id, turn_id: params.turn_id },
            this.turnEnded,
          ),
        this.clientInfo?.type === "extension" &&
          params.session_context === "live" &&
          method !== "getInfo" &&
          this.endingTurnId !== params.turn_id &&
          this.readRequestHeaders != null)
      ) {
        let headers = await this.readRequestHeaders();
        if (headers != null && this.clientInfo.requestHeadersVersion !== 1)
          throw new Error(
            "This browser requires managed request headers. Update the browser extension before continuing.",
          );
        this.clientInfo.requestHeadersVersion === 1 &&
          ((params.request_headers = validateRequestHeaders(headers ?? [])),
          this.lastSessionParams?.session_id === params.session_id &&
            this.lastSessionParams.turn_id === params.turn_id &&
            (this.lastSessionParams.request_headers = params.request_headers));
      }
      if (preparation.ended)
        throw new Error(
          "Browser turn ended while reading request-header policy",
        );
      return this.sendRequest(method, { ...request, ...params });
    } finally {
      this.preparingRequests.delete(preparation);
    }
  }
  matchesCurrentTurn(turn: any): any {
    if (this.getTurnMetadata() == null && this.lastSessionParams == null)
      return !1;
    let params = this.getSessionParams();
    return (
      params.session_id === turn.session_id && params.turn_id === turn.turn_id
    );
  }
  getSessionParams(): any {
    let metadata = this.getTurnMetadata();
    if (metadata == null && this.lastSessionParams != null)
      return { ...this.lastSessionParams, session_context: "cached" };
    let sessionId = metadataSession(metadata);
    if (typeof sessionId != "string")
      throw new Error("Missing required browser session_id");
    let turnId = metadata?.turn_id;
    if (typeof turnId != "string")
      throw new Error("Missing required browser turn_id");
    let params =
      this.lastSessionParams?.session_id === sessionId &&
      this.lastSessionParams.turn_id === turnId
        ? { ...this.lastSessionParams }
        : { session_id: sessionId, turn_id: turnId };
    return (
      (params.session_context = "live"),
      this.browserSurface === "dot" &&
        ((params.browser_surface = "dot"),
        (params.orbit_id = metadata?.orbit_id)),
      params
    );
  }
}

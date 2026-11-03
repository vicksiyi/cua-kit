import type { PausedRequest } from "./document_responses";
interface Header {
  name: string;
  value: string;
}
function parseUrl(value: string, base?: string) {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}
/** Original qe/UB/IX/Es/qB authority key; file keys include the path. */
export function downloadSourceOrigin(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const url = parseUrl(value);
  if (url == null) return null;
  if (url.protocol === "file:") {
    url.search = "";
    url.hash = "";
    return url.href;
  }
  if (
    (url.protocol === "codex-sandbox:" || url.protocol === "https:") &&
    [
      "web-sandbox.oaiusercontent.com",
      "staging-web-sandbox.oaiusercontent.com",
    ].some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    ) &&
    url.port === "" &&
    url.username === "" &&
    url.password === ""
  )
    return `${url.protocol}//${url.host}`;
  return url.protocol === "http:" || url.protocol === "https:"
    ? url.origin
    : null;
}
function headerValue(headers: Header[] | undefined, name: string) {
  return headers?.find((header) => header.name.toLowerCase() === name)?.value;
}
function isAttachment(headers?: Header[]) {
  return /^attachment(?:\s*;|\s*$)/i.test(
    headerValue(headers, "content-disposition") ?? "",
  );
}
function contentType(headers?: Header[]) {
  return headerValue(headers, "content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
}
function isMedia(type?: string) {
  return (
    type === "application/pdf" ||
    type?.startsWith("image/") === true ||
    type?.startsWith("video/") === true
  );
}
function isRenderable(type?: string) {
  return (
    type === "text/html" ||
    type === "text/plain" ||
    type === "text/json" ||
    type === "application/json" ||
    (type?.startsWith("application/") === true && type.endsWith("+json")) ||
    type === "text/xml" ||
    type === "application/xml" ||
    type === "application/rss+xml" ||
    type === "application/atom+xml" ||
    type === "application/xhtml+xml" ||
    isMedia(type)
  );
}
export function downloadResponseOverrides(response: PausedRequest) {
  if (
    response.responseStatusCode == null ||
    response.responseHeaders == null ||
    isAttachment(response.responseHeaders) ||
    !isMedia(contentType(response.responseHeaders))
  )
    return;
  const hasDisposition = response.responseHeaders.some(
    (header) => header.name.toLowerCase() === "content-disposition",
  );
  return {
    responseCode: response.responseStatusCode,
    ...(response.responseStatusText
      ? { responsePhrase: response.responseStatusText }
      : {}),
    responseHeaders: hasDisposition
      ? response.responseHeaders.map((header) =>
          header.name.toLowerCase() === "content-disposition"
            ? {
                ...header,
                value: header.value.replace(/^[^;]*/u, "attachment"),
              }
            : header,
        )
      : [
          ...response.responseHeaders,
          { name: "Content-Disposition", value: "attachment" },
        ],
  };
}
type Pending =
  | { type: "blob"; url: string }
  | {
      type: "http";
      requestId: string;
      url: string;
      responseOverrides: ReturnType<typeof downloadResponseOverrides>;
    };
type Intent =
  | { type: "next" }
  | { type: "blob"; url: string }
  | { type: "request"; requestIds: Set<string> };
interface DownloadEvent {
  id: string;
  filename: string;
  url: string;
  status: string;
  tabId?: number;
  session_id?: string;
}
interface DownloadState {
  intent: Intent | undefined;
  pending: Pending | undefined;
  requested: PromiseWithResolvers<Pending>;
  completed: PromiseWithResolvers<DownloadEvent>;
  approvedSourceOrigin: string | undefined;
  blobOrigin: string | undefined;
  allowedUrl: string | undefined;
  downloadId: string | undefined;
  stopTracking: (() => Promise<void>) | undefined;
}
interface DownloadApi {
  addEventListener(
    event: string,
    listener: (event: DownloadEvent) => void,
  ): unknown;
  matchesCurrentSessionId(id: string): boolean;
  supportsBlobDownloads(): Promise<boolean>;
  getCommittedTabUrl(tabId: number): Promise<string | null>;
  setBlobDownloadOrigin(
    tabId: number,
    value: { origin: string; url: string | null } | null,
  ): Promise<unknown>;
  allowDownload(value: {
    tabId: number;
    url: string;
    requestId: string;
  }): Promise<unknown>;
}
interface DownloadResponses {
  on(event: string, listener: (...args: any[]) => any): unknown;
  failResponse(tabId: number, requestId: string): Promise<unknown>;
  continueResponse(
    tabId: number,
    requestId: string,
    overrides?: Record<string, unknown>,
  ): Promise<unknown>;
  addRequestInterceptor(
    tabId: number,
    handler: (request: PausedRequest) => unknown,
  ): Promise<() => Promise<void>>;
}
interface DownloadSecurity {
  currentTabFileTransferUrl(tabId: number, action: "download"): Promise<string>;
  createAuthorityBuilder(): {
    downloadFiles(value: { type: "file"; url: string }): {
      assert(): Promise<unknown>;
    };
  };
}
/** Original pg. Download completion comes from the host; this class owns authorization and paused responses. */
export class Downloads {
  api: DownloadApi;
  documentResponses: DownloadResponses;
  security: DownloadSecurity;
  clientType: string;
  filenamesById = new Map<string, string>();
  activeDownloadTabs = new Set<number>();
  downloadsByTab = new Map<number, DownloadState>();
  constructor(
    api: DownloadApi,
    responses: DownloadResponses,
    security: DownloadSecurity,
    clientType: string,
  ) {
    this.api = api;
    this.documentResponses = responses;
    this.security = security;
    this.clientType = clientType;
    api.addEventListener("onDownloadChange", (event) => {
      if (
        event.session_id != null &&
        !this.api.matchesCurrentSessionId(event.session_id)
      )
        return;
      const url = parseUrl(event.url),
        isBlob = url?.protocol === "blob:";
      if (!isBlob) this.filenamesById.set(event.id, event.filename);
      for (const [tabId, state] of this.downloadsByTab) {
        if (event.tabId != null && event.tabId !== tabId) continue;
        if (isBlob) {
          if (event.tabId !== tabId) continue;
          const intent = state.intent;
          if (
            event.status === "started" &&
            state.blobOrigin === url.origin &&
            (intent?.type === "next" ||
              (intent?.type === "blob" && intent.url === event.url))
          ) {
            state.allowedUrl = event.url;
            this.claimDownload(state, { type: "blob", url: event.url });
          }
        }
        if (event.url === state.allowedUrl) {
          if (state.downloadId == null) {
            if (event.status !== "started") continue;
            state.downloadId = event.id;
          }
          if (event.id === state.downloadId)
            switch (event.status) {
              case "started":
              case "in_progress":
                break;
              case "complete":
                state.completed.resolve(event);
                break;
              case "failed":
              case "canceled":
                state.completed.reject(
                  new Error(
                    `Download ${event.id} ${event.status === "failed" ? "failed" : "was canceled"}.`,
                  ),
                );
                break;
              default:
                throw new Error(`Unknown download status: ${event.status}`);
            }
        }
      }
    });
    responses.on("tabDetached", (tabId) => {
      this.disableDownload(tabId).catch(() => {});
    });
    responses.on("intercept", (tabId, response, claim) => {
      const state = this.downloadsByTab.get(tabId),
        intent = state?.intent;
      let intended = false;
      switch (intent?.type) {
        case undefined:
        case "blob":
          break;
        case "next":
          intended = true;
          break;
        case "request":
          intended = intent.requestIds.has(response.requestId);
          break;
        default:
          throw new Error(`Unknown download intent: ${intent}`);
      }
      if (this.isDownload(response, intended)) {
        claim();
        if (!intended) {
          responses.failResponse(tabId, response.requestId).catch(() => {});
          return;
        }
        if (state == null) throw new Error("Expected an active download.");
        this.claimDownload(state, {
          type: "http",
          requestId: response.requestId,
          responseOverrides: downloadResponseOverrides(response),
          url: response.request.url,
        });
      }
    });
  }
  async withDownload<T>(tabId: number, action: () => Promise<T>) {
    if (this.activeDownloadTabs.has(tabId))
      throw new Error(
        "A download is already in progress in this tab. Wait for it to finish before starting another.",
      );
    this.activeDownloadTabs.add(tabId);
    try {
      return await action();
    } finally {
      try {
        await this.disableDownload(tabId);
      } finally {
        this.activeDownloadTabs.delete(tabId);
      }
    }
  }
  async enableDownload(tabId: number) {
    const state = this.getDownload(tabId);
    await this.authorizeSource(tabId, state);
    state.intent = { type: "next" };
    if (!(await this.api.supportsBlobDownloads())) return;
    const committed = await this.api.getCommittedTabUrl(tabId),
      url = committed == null ? null : new URL(committed);
    if (url?.protocol === "http:" || url?.protocol === "https:")
      await this.armBlobDownload(tabId, state, url.origin, null);
  }
  async enableMediaDownload(tabId: number, target: string, frameId: string) {
    const state = this.getDownload(tabId),
      url = new URL(target);
    if (url.protocol === "blob:") {
      const origin = parseUrl(url.origin);
      if (origin?.protocol !== "http:" && origin?.protocol !== "https:")
        throw new Error("Blob downloads must come from the current website.");
      if (!(await this.api.supportsBlobDownloads()))
        throw new Error("Blob downloads are not supported by this browser.");
      const committed = await this.api.getCommittedTabUrl(tabId),
        current = committed == null ? null : new URL(committed);
      if (
        (current?.protocol !== "http:" && current?.protocol !== "https:") ||
        current.origin !== origin.origin
      )
        throw new Error("Blob downloads must come from the current website.");
      await this.authorizeSource(tabId, state);
      state.intent = { type: "blob", url: target };
      await this.armBlobDownload(tabId, state, origin.origin, target);
    } else {
      await this.authorizeSource(tabId, state);
      url.hash = "";
      const requestIds = new Set<string>();
      state.intent = { type: "request", requestIds };
      state.stopTracking = await this.documentResponses.addRequestInterceptor(
        tabId,
        (request) => {
          if (
            request.resourceType === "Document" &&
            request.frameId === frameId &&
            ((requestIds.size === 0 && request.request.url === url.href) ||
              (request.redirectedRequestId != null &&
                requestIds.has(request.redirectedRequestId)))
          )
            requestIds.add(request.requestId);
        },
      );
    }
  }
  async disableDownload(tabId: number) {
    const state = this.downloadsByTab.get(tabId);
    if (state != null) {
      this.downloadsByTab.delete(tabId);
      try {
        if (state.blobOrigin != null)
          await this.api.setBlobDownloadOrigin(tabId, null);
        if (state.pending?.type === "http")
          await this.documentResponses.failResponse(
            tabId,
            state.pending.requestId,
          );
      } finally {
        await state.stopTracking?.();
      }
    }
  }
  async authorizeSource(tabId: number, state: DownloadState) {
    const url = await this.security.currentTabFileTransferUrl(
      tabId,
      "download",
    );
    await this.security
      .createAuthorityBuilder()
      .downloadFiles({ type: "file", url })
      .assert();
    state.approvedSourceOrigin = downloadSourceOrigin(url) ?? undefined;
  }
  async armBlobDownload(
    tabId: number,
    state: DownloadState,
    origin: string,
    url: string | null,
  ) {
    this.assertCurrentDownload(tabId, state);
    if (state.intent != null) {
      if (origin !== state.approvedSourceOrigin)
        throw new Error("Blob downloads must come from the approved website.");
      state.blobOrigin = origin;
      await this.api.setBlobDownloadOrigin(tabId, { origin, url });
    }
  }
  assertCurrentDownload(tabId: number, state: DownloadState) {
    if (this.downloadsByTab.get(tabId) !== state)
      throw new Error("The download is no longer active.");
  }
  async waitForDownload(tabId: number, timeout: number) {
    const state = this.getDownload(tabId),
      started = Date.now(),
      error = new Error(`Timed out after ${timeout}ms waiting for download.`);
    const { promise: expired, reject } = Promise.withResolvers<never>();
    let timer = setTimeout(() => reject(error), timeout);
    try {
      const pending = await Promise.race([state.requested.promise, expired]);
      if (pending.type === "http") {
        const remaining = timeout - (Date.now() - started);
        if (remaining <= 0) throw error;
        clearTimeout(timer);
        const approved = state.approvedSourceOrigin;
        if (state.blobOrigin != null) {
          await this.api.setBlobDownloadOrigin(tabId, null);
          state.blobOrigin = undefined;
        }
        if (approved == null || downloadSourceOrigin(pending.url) !== approved)
          await this.security
            .createAuthorityBuilder()
            .downloadFiles({ type: "file", url: pending.url })
            .assert();
        timer = setTimeout(() => reject(error), remaining);
        this.assertPendingDownload(tabId, state, pending);
        if (this.clientType === "iab" || this.clientType === "cdp")
          await Promise.race([
            this.api.allowDownload({
              tabId,
              url: pending.url,
              requestId: pending.requestId,
            }),
            expired,
          ]);
        this.assertPendingDownload(tabId, state, pending);
        state.allowedUrl = pending.url;
        await Promise.race([
          this.documentResponses.continueResponse(
            tabId,
            pending.requestId,
            pending.responseOverrides,
          ),
          expired,
        ]);
        this.assertPendingDownload(tabId, state, pending);
        state.pending = undefined;
      }
      const completed = await Promise.race([state.completed.promise, expired]);
      this.filenamesById.set(completed.id, completed.filename);
      return completed;
    } finally {
      clearTimeout(timer);
      await this.disableDownload(tabId);
    }
  }
  getDownload(tabId: number) {
    const existing = this.downloadsByTab.get(tabId);
    if (existing != null) return existing;
    const state: DownloadState = {
      intent: undefined,
      pending: undefined,
      requested: Promise.withResolvers(),
      completed: Promise.withResolvers(),
      approvedSourceOrigin: undefined,
      blobOrigin: undefined,
      allowedUrl: undefined,
      downloadId: undefined,
      stopTracking: undefined,
    };
    state.completed.promise.catch(() => {});
    this.downloadsByTab.set(tabId, state);
    return state;
  }
  claimDownload(state: DownloadState, pending: Pending) {
    state.intent = undefined;
    state.pending = pending;
    state.requested.resolve(pending);
  }
  assertPendingDownload(tabId: number, state: DownloadState, pending: Pending) {
    if (this.downloadsByTab.get(tabId) !== state || state.pending !== pending)
      throw new Error("The paused download response is no longer available.");
  }
  getPath(id: string) {
    return this.filenamesById.get(id) ?? null;
  }
  isDownload(response: PausedRequest, intended = false) {
    const type = contentType(response.responseHeaders);
    const redirect =
      [301, 302, 303, 307, 308].includes(
        response.responseStatusCode as number,
      ) && headerValue(response.responseHeaders, "location") != null;
    return (
      response.resourceType === "Document" &&
      !redirect &&
      (isAttachment(response.responseHeaders) ||
        (intended && isMedia(type)) ||
        ((intended || (type !== undefined && type !== "")) &&
          !isRenderable(type)))
    );
  }
}

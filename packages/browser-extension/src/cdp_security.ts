/** Original Qp/Xp/Yp and helpers: protect the SIWC bootstrap cookie at the CDP boundary. */
const bootstrapCookie = "__Host-siwc-browser-bootstrap";
type ObjectValue = Record<string, unknown>;
type FieldFilters = Record<string, (value: unknown) => unknown>;
function isObject(value: unknown): value is ObjectValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function mapFields(value: unknown, filters: FieldFilters): unknown {
  return isObject(value)
    ? Object.fromEntries(
        Object.entries(value).map(([key, entry]) => {
          const filter = Object.hasOwn(filters, key) ? filters[key] : undefined;
          return [key, filter == null ? entry : filter(entry)];
        }),
      )
    : value;
}
function isBootstrapCookieLine(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.split("=", 1)[0]?.trim() === bootstrapCookie
  );
}
function filterCookies(value: unknown): unknown {
  return Array.isArray(value)
    ? value.filter((cookie) =>
        isObject(cookie)
          ? cookie.name !== bootstrapCookie &&
            (!isObject(cookie.cookie) ||
              cookie.cookie.name !== bootstrapCookie) &&
            !isBootstrapCookieLine(cookie.cookieLine)
          : true,
      )
    : value;
}
function filterHeaderValue(name: string, value: unknown): unknown {
  const lowerName = name.toLowerCase();
  if (
    (lowerName !== "cookie" && lowerName !== "set-cookie") ||
    typeof value !== "string" ||
    !value.includes(bootstrapCookie)
  )
    return value;
  const separator = lowerName === "cookie" ? ";" : "\n";
  return value
    .split(separator)
    .filter((line) => !isBootstrapCookieLine(line))
    .join(separator);
}
function filterHeaders(value: unknown): unknown {
  if (Array.isArray(value))
    return value.flatMap((header) => {
      if (!isObject(header) || typeof header.name !== "string") return [header];
      const filtered = filterHeaderValue(header.name, header.value);
      return filtered === "" && filtered !== header.value
        ? []
        : [{ ...header, value: filtered }];
    });
  if (isObject(value))
    return Object.fromEntries(
      Object.entries(value).flatMap(([name, entry]) => {
        const filtered = filterHeaderValue(name, entry);
        return filtered === "" && filtered !== entry ? [] : [[name, filtered]];
      }),
    );
  return value;
}
function filterRawHeaders(value: unknown): unknown {
  return typeof value === "string" && value.includes(bootstrapCookie)
    ? undefined
    : value;
}
const headerFilters: FieldFilters = {
  headers: filterHeaders,
  requestHeaders: filterHeaders,
  responseHeaders: filterHeaders,
  headersText: filterRawHeaders,
  requestHeadersText: filterRawHeaders,
};
function filterResource(value: unknown): unknown {
  return mapFields(value, headerFilters);
}

export function validateCdpCommand(method: string, params: unknown): void {
  if (method === "Target.exposeDevToolsProtocol")
    throw new Error(
      "Browser Use cannot expose debugger access to page scripts.",
    );
  if (
    method === "Target.setAutoAttach" &&
    (!isObject(params) ||
      (params.autoAttach !== false && params.flatten !== true))
  )
    throw new Error("Browser Use requires flattened debugger sessions.");
}
export function filterCdpResult(method: string, result: unknown): unknown {
  switch (method) {
    case "Network.getCookies":
    case "Network.getAllCookies":
    case "Storage.getCookies":
      return mapFields(result, { cookies: filterCookies });
    case "Network.loadNetworkResource":
      return mapFields(result, { resource: filterResource });
    default:
      return result;
  }
}
export interface CdpEvent {
  method: string;
  params?: unknown;
  [key: string]: unknown;
}
export function filterCdpEvent<Event extends CdpEvent>(
  event: Event,
): Event | null {
  if (event.method === "Target.receivedMessageFromTarget") return null;
  let params: unknown;
  switch (event.method) {
    case "Network.requestWillBeSent":
      params = mapFields(event.params, {
        request: filterResource,
        redirectResponse: filterResource,
      });
      break;
    case "Network.responseReceived":
    case "Network.webSocketHandshakeResponseReceived":
      params = mapFields(event.params, { response: filterResource });
      break;
    case "Network.webSocketWillSendHandshakeRequest":
    case "Fetch.authRequired":
      params = mapFields(event.params, { request: filterResource });
      break;
    case "Network.requestIntercepted":
    case "Fetch.requestPaused":
      params = mapFields(event.params, {
        request: filterResource,
        responseHeaders: filterHeaders,
      });
      break;
    case "Network.requestWillBeSentExtraInfo":
      params = mapFields(event.params, {
        ...headerFilters,
        associatedCookies: filterCookies,
      });
      break;
    case "Network.responseReceivedExtraInfo":
      params = mapFields(event.params, {
        ...headerFilters,
        blockedCookies: filterCookies,
        exemptedCookies: filterCookies,
      });
      break;
    case "Network.responseReceivedEarlyHints":
      params = filterResource(event.params);
      break;
    case "Network.signedExchangeReceived":
      params = mapFields(event.params, {
        info: (info) =>
          mapFields(info, {
            outerResponse: filterResource,
            header: filterResource,
          }),
      });
      break;
    case "Audits.issueAdded":
      params = mapFields(event.params, {
        issue: (issue) =>
          mapFields(issue, {
            details: (details) =>
              mapFields(details, {
                cookieIssueDetails: (cookie) =>
                  mapFields(cookie, { rawCookieLine: filterRawHeaders }),
              }),
          }),
      });
      break;
    default:
      return event;
  }
  return isObject(params) ? { ...event, params } : event;
}

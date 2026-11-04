import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings, extensionFunctionCalls } from "./extension-source";
import {
  validateCdpCommand,
  filterCdpResult,
  filterCdpEvent,
} from "../packages/browser-extension/src/cdp_security";
import { registerBrowserEventListeners } from "../packages/browser-extension/src/browser_events";
const original = extensionBindings(
  ["Qp", "Xp", "Yp", "Qe", "ve", "On", "Pn", "xc", "Mc", "ps", "Rt", "fs"],
  {},
);
const cookie = "__Host-siwc-browser-bootstrap";
const secret = "test-bootstrap-value";
const header = `${cookie}=${secret}`;
const cookieEntries = [
  { name: cookie, value: secret },
  { cookie: { name: cookie, value: secret } },
  { cookieLine: ` ${header}; Secure` },
  { name: "other", value: "visible" },
  null,
  5,
];
const headers = {
  Cookie: `other=1; ${header}; last=2`,
  "Set-Cookie": `${header}; Secure\nother=2`,
  "x-keep": "visible",
  empty: "",
  __proto__: "unrelated",
};
const headerArray = [
  { name: "Cookie", value: header },
  { name: "Set-Cookie", value: header },
  { name: "COOKIE", value: `other=1; ${header}` },
  { name: "x", value: header },
  { name: "cookie", value: "" },
  { name: 5, value: "malformed" },
  null,
];
const resources = [
  null,
  undefined,
  5,
  [],
  "text",
  {},
  {
    headers,
    requestHeaders: headerArray,
    responseHeaders: headers,
    headersText: `HTTP/1.1 200\r\n${header}`,
    requestHeadersText: header,
    url: "https://example.test",
  },
  { headers: { ["__proto__"]: "value", constructor: "keep", Cookie: header } },
  { headers: { Cookie: 12, "Set-Cookie": [header] } },
  { headers: { cookie: `${cookie}Suffix=keep;${header}` } },
];
function result(run: () => unknown) {
  try {
    return { value: run() };
  } catch (error: any) {
    return { error: error.message };
  }
}

test("extension CDP guard matches original debugger access and flattened-session rules", () => {
  for (const method of [
    "Target.exposeDevToolsProtocol",
    "Target.setAutoAttach",
    "Runtime.evaluate",
    "Target.sendMessageToTarget",
  ]) {
    for (const params of [
      undefined,
      null,
      false,
      [],
      {},
      { autoAttach: false },
      { autoAttach: true },
      { autoAttach: true, flatten: true },
      { autoAttach: false, flatten: false },
      { autoAttach: 0, flatten: 1 },
      Object.create({ flatten: true }),
    ]) {
      assert.deepEqual(
        result(() => validateCdpCommand(method, params)),
        result(() => original.Qp(method, params)),
      );
    }
  }
  assert.throws(
    () => validateCdpCommand("Target.exposeDevToolsProtocol", {}),
    /cannot expose debugger access/,
  );
  assert.throws(
    () => validateCdpCommand("Target.setAutoAttach", {}),
    /flattened debugger sessions/,
  );
});

test("extension CDP reply filters preserve original shapes, references and bootstrap-cookie removal", () => {
  for (const method of [
    "Network.getCookies",
    "Network.getAllCookies",
    "Storage.getCookies",
    "Network.loadNetworkResource",
    "Runtime.evaluate",
  ]) {
    for (const value of [
      ...resources,
      { cookies: cookieEntries },
      { cookies: "malformed" },
      ...resources.map((resource) => ({ resource, untouched: "keep" })),
    ]) {
      const before = structuredClone(value);
      const actual = filterCdpResult(method, value),
        expected = original.Xp(method, value);
      assert.deepEqual(actual, expected);
      assert.equal(actual === value, expected === value);
      assert.deepEqual(value, before);
    }
  }
  const filtered: any = filterCdpResult("Network.getCookies", {
    cookies: cookieEntries,
  });
  assert.deepEqual(filtered.cookies, [
    { name: "other", value: "visible" },
    null,
    5,
  ]);
  const response: any = filterCdpResult("Network.loadNetworkResource", {
    resource: { headers: { cookie: header }, headersText: header },
  });
  assert.deepEqual(response, {
    resource: { headers: {}, headersText: undefined },
  });
});

test("extension CDP event filters cover every original event branch and preserve unknown events", () => {
  const methods = [
    "Target.receivedMessageFromTarget",
    "Network.requestWillBeSent",
    "Network.responseReceived",
    "Network.webSocketHandshakeResponseReceived",
    "Network.webSocketWillSendHandshakeRequest",
    "Fetch.authRequired",
    "Network.requestIntercepted",
    "Fetch.requestPaused",
    "Network.requestWillBeSentExtraInfo",
    "Network.responseReceivedExtraInfo",
    "Network.responseReceivedEarlyHints",
    "Network.signedExchangeReceived",
    "Audits.issueAdded",
    "Runtime.consoleAPICalled",
  ];
  for (const method of methods)
    for (const resource of resources) {
      for (const params of [
        resource,
        {
          request: resource,
          redirectResponse: resource,
          response: resource,
          headers,
          responseHeaders: headerArray,
          associatedCookies: cookieEntries,
          blockedCookies: cookieEntries,
          exemptedCookies: cookieEntries,
          info: { outerResponse: resource, header: resource },
          issue: { details: { cookieIssueDetails: { rawCookieLine: header } } },
        },
      ]) {
        const event = { source: { tabId: 3 }, method, params },
          before = structuredClone(event);
        const actual = filterCdpEvent(event),
          expected = original.Yp(event);
        assert.deepEqual(actual, expected);
        assert.equal(actual === event, expected === event);
        assert.deepEqual(event, before);
      }
    }
  assert.equal(
    filterCdpEvent({
      method: "Target.receivedMessageFromTarget",
      params: { message: secret },
    }),
    null,
  );
  const raw = {
    method: "Runtime.consoleAPICalled",
    params: { args: [header] },
  };
  assert.equal(
    filterCdpEvent(raw),
    raw,
    "faithful filter is scoped, not a blanket scrubber of arbitrary page data",
  );
});

function eventFixture(useOriginal: boolean) {
  const listeners = new Map<string, (...args: any[]) => any>();
  const trace: any[] = [];
  const event = (name: string) => ({
    addListener(fn: any) {
      trace.push(["listen", name]);
      listeners.set(name, fn);
    },
  });
  const chrome: any = {
    debugger: { onDetach: event("detach"), onEvent: event("event") },
    downloads: { onCreated: event("created"), onChanged: event("changed") },
    webNavigation: { onCreatedNavigationTarget: event("navigation") },
  };
  const handler: any = {
    addDownloadChangeListener(fn: any) {
      trace.push(["listen", "downloadChange"]);
      listeners.set("downloadChange", fn);
    },
    handleDownloadCreated(value: any) {
      trace.push(["created", value]);
    },
    handleDownloadChanged(value: any) {
      trace.push(["changed", value]);
    },
    async handleCreatedNavigationTarget(value: any) {
      trace.push(["navigation", value]);
      throw Error("test: ignored navigation failure");
    },
  };
  const peers = ["kernel", "native"].map((name) => ({
    sendCdpDetach: (value: any) => trace.push([name, "detach", value]),
    sendCdpEvent: (value: any) => trace.push([name, "event", value]),
    sendDownloadChange: (value: any) => trace.push([name, "download", value]),
  }));
  const broadcast = (send: any) => {
    peers.forEach(send);
  };
  if (useOriginal)
    extensionFunctionCalls(
      "dR",
      [
        "chrome.debugger.onDetach.addListener",
        "chrome.debugger.onEvent.addListener",
        "u.addDownloadChangeListener",
        "chrome.downloads.onCreated.addListener",
        "chrome.downloads.onChanged.addListener",
        "chrome.webNavigation.onCreatedNavigationTarget.addListener",
      ],
      { chrome, u: handler, h: broadcast, Yp: original.Yp },
    );
  else registerBrowserEventListeners(chrome, handler, broadcast);
  return { listeners, trace };
}
test("restored startup event listeners match original dR and filter before broadcasting to peers", async () => {
  const run = async (useOriginal: boolean) => {
    const { listeners, trace } = eventFixture(useOriginal);
    listeners.get("detach")!({ tabId: 3 });
    listeners.get("event")!({ tabId: 3 }, "Network.requestWillBeSent", {
      request: { headers: { Cookie: header } },
    });
    listeners.get("event")!({ tabId: 3 }, "Target.receivedMessageFromTarget", {
      message: secret,
    });
    listeners.get("created")!({ id: 1 });
    listeners.get("changed")!({ id: 1, state: { current: "complete" } });
    listeners.get("downloadChange")!({ id: "1", status: "complete" });
    listeners.get("navigation")!({ sourceTabId: 3, tabId: 7 });
    await Promise.resolve();
    return trace;
  };
  const actual = await run(false);
  assert.deepEqual(actual, await run(true));
  assert.equal(JSON.stringify(actual).includes(secret), false);
  assert.equal(actual.filter((entry) => entry[1] === "event").length, 3); // one registration plus two peers
});

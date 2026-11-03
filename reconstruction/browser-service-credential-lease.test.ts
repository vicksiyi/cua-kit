import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import { CredentialSubmissionLease } from "../packages/browser/src/service/credentials/lease";
import { isCredentialDocumentContained } from "../packages/browser/src/service/credentials/containment";
const original = originalServiceBindings(["Z_", "wo", "Cf", "sJ"]);
function fixture(useOriginal: boolean, ordinary: boolean, mode: string) {
  const trace: any[] = [];
  let owner: any;
  const cdp: any = {
    suppressRawNetworkEvents(id: number) {
      trace.push(["suppress", id]);
      return () => trace.push("unblock");
    },
    on(name: string) {
      trace.push(["on", name]);
    },
    removeListener(name: string) {
      trace.push(["off", name]);
    },
    async call(_id: number, method: string, params: any) {
      trace.push([method, params]);
      if (method === "Page.getFrameTree")
        return {
          frameTree: {
            frame: {
              id: "root",
              securityOrigin:
                mode === "origin"
                  ? "https://other.test"
                  : "https://fixture.test",
            },
            childFrames: mode === "frames" ? [{}] : [],
          },
        };
      if (method === "DOM.getDocument")
        return {
          root: {
            localName: "html",
            shadowRoots: mode === "nested" ? [{ localName: "IFRAME" }] : [],
          },
        };
      if (method === "Page.createIsolatedWorld")
        return { executionContextId: 4 };
      if (method === "Runtime.evaluate")
        return { result: { value: mode !== "worker" } };
      return {};
    },
    async browserAuthNewTargetCheck() {
      trace.push("targets");
      return mode === "targets" ? "error" : "contained";
    },
    async protectBrowserAuthNewTargets() {
      trace.push("protect-new");
      return async () => trace.push("remove-new");
    },
    async protectServiceWorkerStarts() {
      trace.push("protect-workers");
      return async () => trace.push("remove-workers");
    },
    async protectBrowserAuthServiceWorkerBypass() {
      trace.push("bypass");
      return async () => trace.push("remove-bypass");
    },
  };
  const requests: any = {
    on(name: string) {
      trace.push(["request-on", name]);
    },
    removeListener(name: string) {
      trace.push(["request-off", name]);
    },
    async addRequestInterceptor(
      _id: number,
      _handler: any,
      priority: number,
      options: any,
    ) {
      trace.push(["interceptor", priority, options]);
      if (mode === "closed") owner.closePromise = Promise.resolve();
      return async () => trace.push("remove-interceptor");
    },
  };
  const matcher = async () => {
    trace.push("matches");
    return mode !== "mismatch";
  };
  const unsafe = ordinary
    ? async () => {
        trace.push("unsafe");
        return mode === "unsafe";
      }
    : undefined;
  owner = new (useOriginal ? original.Z_ : CredentialSubmissionLease)(
    cdp,
    requests,
    7,
    "root",
    { origin: "https://fixture.test", url: "https://fixture.test/post" },
    matcher,
    unsafe,
    new Map(),
  );
  owner.requestId = "fixed";
  return { owner, trace, cdp };
}
test("assembled lease start and containment match original private/ordinary setup and failures", async () => {
  for (const ordinary of [false, true])
    for (const mode of [
      "normal",
      "origin",
      "frames",
      "nested",
      "worker",
      "targets",
      "closed",
    ]) {
      async function run(ref: boolean) {
        const { owner, trace } = fixture(ref, ordinary, mode);
        let error;
        try {
          await owner.start();
        } catch (e) {
          error = (e as Error).message;
        }
        return { trace, error };
      }
      assert.deepEqual(await run(false), await run(true));
    }
  for (const mode of [
    "normal",
    "origin",
    "frames",
    "nested",
    "worker",
    "targets",
  ]) {
    async function run(ref: boolean) {
      const { cdp, trace } = fixture(ref, false, mode);
      const reasons: string[] = [];
      return {
        value: await (ref ? original.Cf : isCredentialDocumentContained)(
          cdp,
          7,
          "https://fixture.test",
          (reason: string) => reasons.push(reason),
        ),
        trace,
        reasons,
      };
    }
    assert.deepEqual(await run(false), await run(true));
  }
});
test("assembled lease admission matches original form candidate and redirect rules", async () => {
  for (const ordinary of [false, true])
    for (const mode of [
      "normal",
      "invalid",
      "http",
      "cross",
      "background",
      "get",
      "head",
      "missing-network",
      "mismatch",
      "unsafe",
      "child",
      "claimed",
      "redirect",
      "settled",
      "submitting",
    ]) {
      async function run(ref: boolean) {
        const { owner, trace } = fixture(ref, ordinary, mode);
        owner.rejectOrdinaryRequest = (
          request: any,
          outcome: string,
          reason: any,
        ) => {
          trace.push(["reject", request.resourceType, outcome, reason]);
          return "block";
        };
        owner.ordinarySubmissionUrl = "https://fixture.test/post";
        owner.ordinaryPhase =
          mode === "submitting" ? "submitting" : "before_submit";
        owner.ordinarySubmissionSettled = mode === "settled";
        owner.candidateClaimed = mode === "claimed";
        owner.allowedRedirects.add("previous");
        const request = {
          requestId: "fetch",
          networkId: mode === "missing-network" ? undefined : "network",
          frameId: mode === "child" ? "child" : "root",
          resourceType: mode === "background" ? "Script" : "Document",
          redirectedRequestId: mode === "redirect" ? "previous" : undefined,
          request: {
            url:
              mode === "invalid"
                ? "bad"
                : mode === "http"
                  ? "http://fixture.test/post"
                  : mode === "cross"
                    ? "https://other.test/post"
                    : "https://fixture.test/post#hash",
            method:
              mode === "get" || mode === "redirect"
                ? "GET"
                : mode === "head"
                  ? "HEAD"
                  : "POST",
            headers: {},
            postData: "fixture",
          },
        };
        const value = await owner.onRequest(request);
        return {
          value,
          trace,
          candidate: owner.candidate,
          claimed: owner.candidateClaimed,
          redirects: [...owner.allowedRedirects],
          urls: [...owner.allowedUrls],
          diagnostics: owner.diagnostics(),
        };
      }
      const actual = await run(false);
      assert.deepEqual(actual, await run(true), `${ordinary}/${mode}`);
      if (mode === "normal") assert.equal(actual.candidate.fetchId, "fetch");
    }
});
test("assembled lease confirms a synthetic private POST from admission through correlated completion and cleanup", async () => {
  const { owner, trace } = fixture(false, false, "normal");
  await owner.start();
  await owner.onRequest({
    requestId: "fetch",
    networkId: "network",
    frameId: "root",
    resourceType: "Document",
    request: { url: "https://fixture.test/post", method: "POST", headers: {} },
  });
  const emit = (method: string, params: any) =>
    owner.onEvent({ method, params, source: { tabId: 7 } });
  emit("Network.requestWillBeSent", {
    requestId: "network",
    loaderId: "loader",
    frameId: "root",
    type: "Document",
    request: { url: "https://fixture.test/post", method: "POST" },
  });
  emit("Network.responseReceived", {
    requestId: "network",
    loaderId: "loader",
    frameId: "root",
    type: "Document",
    response: { url: "https://fixture.test/post", status: 200 },
  });
  emit("Page.frameNavigated", {
    frame: { id: "root", loaderId: "loader", url: "https://fixture.test/post" },
  });
  owner.onRequestResolution(7, { requestId: "fetch" }, "continued");
  assert.equal(await owner.result(10), "submitted");
  await owner.close();
  assert.equal(trace.at(-1), "unblock");
});

test("assembled URL command navigates real Chromium with shared lease registry and grants the new loader", async () => {
  const { chromium } = await import("playwright");
  const { EventEmitter } = await import("node:events");
  const { createServer } = await import("node:http");
  const { NavigateTabUrlCommand } =
    await import("../packages/browser/src/service/commands/navigate_url");
  const { waitForCdpEvent } =
    await import("../packages/browser/src/service/cdp/event_wait");
  const server = createServer((_req, res) =>
    res.end("<title>navigation fixture</title>"),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(),
      session = await page.context().newCDPSession(page);
    const cdp: any = new EventEmitter();
    cdp.call = (_id: number, method: string, params: any) =>
      session.send(method as any, params);
    cdp.waitForEvent = waitForCdpEvent.bind(cdp);
    cdp.readDocumentState = async () => {
      const response = await session.send("Runtime.evaluate", {
        expression: "({href:location.href})",
        returnByValue: true,
      });
      return response.result.value;
    };
    for (const method of [
      "Page.frameStartedNavigating",
      "Page.frameStartedLoading",
      "Page.frameNavigated",
      "Page.navigatedWithinDocument",
      "Page.domContentEventFired",
      "Page.loadEventFired",
    ])
      session.on(method as any, (params: any) =>
        cdp.emit("event", { method, params, source: { tabId: 7 } }),
      );
    const permits: any[] = [];
    const context: any = {
      cdp,
      documentResponses: {},
      getCurrentSessionId: () => "session",
      followSessionTab: async () => {},
      acquireAuthority: () => ({
        triggerNetworkEgress: () => ({ assert: async () => {} }),
      }),
      credentialObservationGate: {
        epoch: 3,
        permitNavigatedDocument(...args: any[]) {
          permits.push(args);
        },
      },
    };
    const url = `http://127.0.0.1:${(server.address() as any).port}/target`;
    assert.deepEqual(
      await NavigateTabUrlCommand(
        { tab_id: 7, url, timeout_ms: 3000 },
        context,
      ),
      {},
    );
    assert.equal(page.url(), url);
    assert.equal(permits.length, 1);
    assert.equal(permits[0][0], 7);
    assert.equal(permits[0][2], 3);
    assert.equal(typeof permits[0][1], "string");
    assert.equal(cdp.listenerCount("event"), 0);
    assert.equal(cdp.listenerCount("tabDetached"), 0);
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

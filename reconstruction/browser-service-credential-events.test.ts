import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  CredentialLeaseEvents,
  credentialUrl,
} from "../packages/browser/src/service/credentials/lease_events";
const { Z_: Original, wo } = originalServiceBindings(["Z_", "wo"]);
function fixture(original: boolean, ordinary: boolean) {
  const trace: any[] = [],
    target = {
      origin: "https://fixture.test",
      url: "https://fixture.test/post",
    },
    unsafe = ordinary ? async () => false : undefined;
  const owner = original
    ? new Original(
        { suppressRawNetworkEvents: () => () => {} },
        {},
        7,
        "root",
        target,
        undefined,
        unsafe,
        new Map(),
      )
    : new (CredentialLeaseEvents as any)();
  Object.assign(owner, {
    tabId: 7,
    frameId: "root",
    target,
    unsafeOrdinaryRequest: unsafe,
    requestId: "fixed",
    async close() {
      trace.push("close");
    },
    async stopPausedTarget(id: string) {
      trace.push(["stop", id]);
    },
  });
  owner.candidate = { networkId: "network", fetchId: "fetch", released: false };
  owner.allowedRedirects.add("fetch");
  owner.allowedUrls.add("https://fixture.test/done");
  const snapshot = () => ({
    trace,
    outcome: owner.outcome,
    diagnostics: owner.diagnostics(),
    candidate: owner.candidate,
    verified: owner.ordinarySiteSubmissionVerified,
    settled: owner.ordinarySiteSubmissionSettled,
    requests: [...owner.networkRequests],
    responses: [...owner.networkResponses],
    frames: [...owner.frameNavigations],
    paused: [...owner.pausedTargets],
    detached: owner.detached,
  });
  return { owner, snapshot };
}
function event(method: string, params: any, source: any = { tabId: 7 }) {
  return { method, params, source };
}
const request = event("Network.requestWillBeSent", {
  requestId: "network",
  loaderId: "loader",
  frameId: "root",
  type: "Document",
  request: { url: "https://fixture.test/post#hash", method: "POST" },
});
const response = event("Network.responseReceived", {
  requestId: "network",
  loaderId: "loader",
  frameId: "root",
  type: "Document",
  response: { url: "https://fixture.test/done#hash", status: 200 },
});
const frame = event("Page.frameNavigated", {
  frame: {
    id: "root",
    loaderId: "loader",
    url: "https://fixture.test/done#hash",
  },
});
test("credential event correlation matches original ordering, release, loader, status and reachability gates", () => {
  const orders = [
    [request, response, frame],
    [frame, response, request],
    [response, request, frame],
  ];
  let cases = 0;
  for (const ordinary of [false, true])
    for (const order of orders)
      for (const mode of [
        "normal",
        "blocked",
        "unreleased",
        "loader",
        "get",
        "status",
        "unreachable",
        "wrong-source",
      ]) {
        const a = fixture(false, ordinary),
          b = fixture(true, ordinary);
        for (const item of order) {
          const e = structuredClone(item);
          if (mode === "loader" && e.method === "Network.responseReceived")
            e.params.loaderId = "other";
          if (mode === "get" && e.method === "Network.requestWillBeSent")
            e.params.request.method = "GET";
          if (mode === "status" && e.method === "Network.responseReceived")
            e.params.response.status = 302;
          if (mode === "unreachable" && e.method === "Page.frameNavigated")
            e.params.frame.unreachableUrl = "x";
          if (mode === "wrong-source") e.source.sessionId = "child";
          a.owner.onEvent(e);
          b.owner.onEvent(e);
        }
        if (mode !== "unreleased") {
          a.owner.onRequestResolution(
            7,
            { requestId: "fetch" },
            mode === "blocked" ? "blocked" : "continued",
          );
          b.owner.onRequestResolution(
            7,
            { requestId: "fetch" },
            mode === "blocked" ? "blocked" : "continued",
          );
        }
        assert.deepEqual(a.snapshot(), b.snapshot(), `${ordinary}/${mode}`);
        cases++;
        if (mode === "normal")
          assert.equal(
            ordinary ? a.owner.ordinarySiteSubmissionVerified : a.owner.outcome,
            ordinary ? true : "submitted",
          );
      }
  assert.equal(cases, 48);
});
test("credential protection events preserve tab/surface distinctions and capped network records", () => {
  const events = [
    event("Page.windowOpen", {}),
    event("Page.javascriptDialogOpening", {}),
    event("Target.attachedToTarget", {
      targetInfo: { type: "service_worker", targetId: "worker" },
      waitingForDebugger: true,
    }),
    event("Target.attachedToTarget", {
      targetInfo: {
        type: "iframe",
        targetId: "frame",
        url: "https://cross.test/",
      },
      waitingForDebugger: true,
    }),
    event("Target.attachedToTarget", {
      targetInfo: {
        type: "iframe",
        targetId: "frame",
        url: "https://cross.test/",
      },
    }),
    event("Page.frameNavigated", {
      frame: {
        id: "child",
        url: "https://cross.test/",
        securityOrigin: "https://cross.test",
      },
    }),
    event("Page.frameNavigated", {
      frame: { id: "child", url: "about:blank" },
    }),
    event("Network.loadingFailed", { requestId: "network" }),
    event("Target.targetDestroyed", { targetId: "frame" }),
  ];
  for (const ordinary of [false, true])
    for (const e of events) {
      const a = fixture(false, ordinary),
        b = fixture(true, ordinary);
      a.owner.onEvent(e);
      b.owner.onEvent(e);
      assert.deepEqual(a.snapshot(), b.snapshot());
    }
  for (const ordinary of [false, true]) {
    const a = fixture(false, ordinary),
      b = fixture(true, ordinary);
    for (let i = 0; i < 35; i++) {
      const e = structuredClone(request);
      e.params.requestId = String(i);
      a.owner.onEvent(e);
      b.owner.onEvent(e);
    }
    assert.deepEqual(a.snapshot(), b.snapshot());
    assert.equal(a.owner.networkRequests.size, 32);
    a.owner.onTabDetached(7);
    b.owner.onTabDetached(7);
    assert.deepEqual(a.snapshot(), b.snapshot());
  }
  for (const url of ["https://fixture.test/a#secret", "bad", "about:blank"])
    assert.equal(credentialUrl(url)?.href, wo(url)?.href);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  createResponseScreenshot,
  emitResponseMetadata,
  responseUrl,
} from "../packages/browser/src/service/runtime/response_metadata";
import { originalServiceBindings } from "./service-source";
function fixture(source: boolean, flags: any = {}) {
  const trace: any[] = [];
  let allowed = true;
  const capture = async (payload: any, _ctx: any, mode: any) => {
    trace.push(["capture", payload, mode]);
    if (flags.captureProtect) allowed = false;
    if (flags.captureError) throw Error("capture");
    return { data: "synthetic" };
  };
  const canObserve = () => allowed;
  const emit = (...args: any[]) => trace.push(["event", ...args.slice(1)]);
  const orig = originalServiceBindings(
    [
      "xue",
      "Eue",
      "yx",
      "bx",
      "Rue",
      "Aue",
      "Pue",
      "Tue",
      "bu",
      "W3",
      "Cue",
      "$3",
    ],
    { Je: canObserve, Ui: capture, an: "jpeg", dt: emit },
  );
  const tabs = [
    {
      id: 1,
      sessionControlled: true,
      active: true,
      url: "https://user:pass@page.invalid:123/path?secret=x#h",
      faviconUrl: "https://icon.invalid/path?q=1",
      title: "  Title  ",
    },
    { id: 2, sessionControlled: false, url: "https://uncontrolled.invalid/" },
    { id: 3, url: "https://other.invalid/" },
  ];
  const context: any = {
    browserId: "browser",
    clientInfo: {
      family: "chrome",
      metadata: { extensionInstanceId: "instance" },
      ...(flags.session ? { discoveryScope: "session" } : {}),
    },
    tabs: {
      async list() {
        trace.push(["list"]);
        if (flags.listProtect) allowed = false;
        if (flags.listError) throw "list-error";
        return flags.empty ? [] : tabs;
      },
      async getActive() {
        trace.push(["active"]);
        if (flags.activeError) throw Error("active");
        return { id: 8, url: "https://fallback.invalid/path" };
      },
    },
  };
  const outcome: any = {
    backend: flags.backend ?? "chrome",
    commandSucceeded: !flags.failed,
    commandType: flags.close ? "close_tab" : "known",
    context,
    params: flags.params ?? {},
    result: flags.result ?? {},
    runtime: {},
  };
  if (flags.initialProtect) allowed = false;
  return {
    trace,
    orig,
    outcome,
    capture: source
      ? orig.$3
      : createResponseScreenshot(emit, canObserve, capture as any),
  };
}
test("response screenshot matches original tab ownership, fallback, privacy rechecks and isolated failures", async () => {
  let count = 0;
  for (const backend of ["chrome", "cdp"])
    for (const session of [false, true])
      for (const flag of [
        {},
        { params: { tab_id: 3 } },
        { params: { tab_id: 2 } },
        { params: { tab_id: 99 } },
        { result: { id: "3" } },
        { close: true, params: { tab_id: 3 } },
        { empty: true },
        { listError: true },
        { captureError: true },
        { listProtect: true },
        { captureProtect: true },
        { initialProtect: true },
        { empty: true, activeError: true },
      ]) {
        const flags = { backend, session, ...flag };
        const a = fixture(true, flags),
          b = fixture(false, flags);
        const expected = await a.capture(a.outcome),
          actual = await b.capture(b.outcome);
        assert.deepEqual(actual, expected, JSON.stringify(flags));
        assert.deepEqual(b.trace, a.trace);
        count++;
        if (flag.captureProtect)
          assert.deepEqual(actual, {
            browserId: "browser",
            browserFamily: "chrome",
          });
        if (
          session &&
          "params" in flag &&
          (flag.params.tab_id === 99 || flag.params.tab_id === 2)
        )
          assert(!b.trace.some((x) => x[0] === "capture"));
      }
  assert.equal(count, 52);
});
test("response metadata matches source field whitelist and URL redaction", () => {
  const { orig } = fixture(false);
  for (const url of [
    undefined,
    "https://user:password@example.invalid:123/path?q=secret#hash",
    "http://example.invalid/",
    "file:///tmp/no",
    "data:text/plain,no",
    "invalid",
  ]) {
    assert.equal(responseUrl(url), orig.bx(url));
    for (const params of [
      { url: "https://fallback.invalid/path?secret=yes" },
      [],
      null,
      { url: 1 },
    ]) {
      const details = {
        currentUrl: url,
        params,
        browserId: "browser",
        screenshot: { url: "synthetic" },
        openTabIds: [],
        sessionEnded: false,
        cloudBrowserHandoff: { tab_id: "3" },
        unknown: "must not leak",
      };
      const a: any[] = [],
        b: any[] = [];
      orig.bu({ setResponseMeta: (x: any) => a.push(x) }, "chrome", details);
      emitResponseMetadata(
        { setResponseMeta: (x: any) => b.push(x) },
        "chrome",
        details,
      );
      assert.deepEqual(b, a);
      assert.equal(b[0]["codex/toolSurface"].unknown, undefined);
    }
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  createSidePanelMessageHandlers,
  isSidePanelLoadEvent,
} from "../packages/browser-extension/src/side_panel_messages";
const valid = {
  type: "CODEX_WORK_SIDE_PANEL_LOAD_EVENT",
  event: "ready",
  attempt: 0,
  elapsedMs: 10,
  timedOut: false,
};
test("side panel load validator matches inherited fields and integer boundaries", () => {
  const source = extensionBindings(["Kk"], {});
  const cases: unknown[] = [
    null,
    4,
    [],
    {},
    valid,
    Object.create(valid),
    { ...valid, extra: true },
  ];
  for (const event of ["timeout", "retry", "open_chatgpt", "other", 1])
    cases.push({ ...valid, event });
  for (const key of ["attempt", "elapsedMs"])
    for (const value of [
      -1,
      0.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER + 1,
      "1",
      undefined,
    ])
      cases.push({ ...valid, [key]: value });
  cases.push({ ...valid, timedOut: 1 });
  for (const value of cases)
    assert.equal(isSidePanelLoadEvent(value), source.Kk(value));
});
test("side panel identity and load handlers preserve sender gates, reply values and error ordering", async () => {
  for (const mode of [
    "normal",
    "wrong-id",
    "wrong-url",
    "query-url",
    "identity-fails",
    "metric-fails",
    "unknown-browser",
  ]) {
    const outputs = [];
    for (const upstream of [true, false]) {
      const trace: any[] = [];
      const runtime: any = {
        id: "fixture",
        getURL: (path: string) => `chrome-extension://fixture/${path}`,
      };
      const userAgent =
        mode === "unknown-browser" ? "Firefox/1" : "Test Chromium/130.0";
      const getInstanceId = async () => {
        trace.push("get-id");
        if (mode === "identity-fails") throw Error("identity failed");
        return "instance-1";
      };
      const reportMetric = async (...args: unknown[]) => {
        trace.push(["metric", ...args]);
        if (mode === "metric-fails") throw "metric failed";
        return "reported";
      };
      const reportFailure = (...args: unknown[]) => {
        trace.push(["failure", ...args]);
      };
      const source = upstream
        ? extensionBindings(["wk", "Kk", "Zk"], {
            chrome: { runtime },
            navigator: { userAgent },
            Be: getInstanceId,
            Un: reportMetric,
            Yt: reportFailure,
          })
        : undefined;
      const api = upstream
        ? { instanceId: source.wk, loadEvent: source.Zk }
        : createSidePanelMessageHandlers({
            runtime,
            userAgent,
            getInstanceId,
            reportMetric,
            reportFailure,
          });
      const sender = {
        id: mode === "wrong-id" ? "other" : "fixture",
        url:
          runtime.getURL(
            mode === "wrong-url" ? "other.html" : "codex-work-sidepanel.html",
          ) + (mode === "query-url" ? "?x=1" : ""),
      };
      const reply = (...args: unknown[]) => {
        trace.push(["reply", ...args]);
      };
      for (const message of [
        {},
        { type: "GET_EXTENSION_INSTANCE_ID" },
        Object.create({ type: "GET_EXTENSION_INSTANCE_ID" }),
        valid,
      ]) {
        trace.push(["identity-return", api.instanceId(message, sender, reply)]);
        trace.push(["load-return", api.loadEvent(message, sender, reply)]);
        await new Promise((resolve) => setImmediate(resolve));
      }
      outputs.push(trace);
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  authQrBounds,
  authQrCode,
  createAuthQrMonitor,
  waitAuthQrPoll,
} from "../packages/browser/src/service/browser_auth/qr_monitor";
import { positiveTabId } from "../packages/browser/src/service/tab_id";
test("QR bounds match original rounding, clipping and invalid geometry", () => {
  const original = originalServiceBindings(["QY", "HD"]);
  for (const x of [-100, -0.2, 0, 1.2, Number.MAX_SAFE_INTEGER, Infinity, NaN])
    for (const y of [-1, 0, 2.8, Infinity])
      for (const size of [0, 0.1, 10]) {
        const points = [
          { x, y },
          { x: x + size, y },
          { x: x + size, y: y + size },
          { x, y: y + size },
        ];
        assert.deepEqual(authQrBounds(points), original.QY(points));
        for (const payload of ["", "synthetic-qr"])
          assert.deepEqual(
            authQrCode(payload, points),
            original.HD(payload, points),
          );
      }
  assert.equal(authQrBounds([]), null);
});
async function scenario(source: boolean, mode: string) {
  const trace: any[] = [];
  const controller = new AbortController();
  let reads = 0,
    checks = 0,
    waits = 0;
  const context = {
    cdp: {
      async call(...args: any[]) {
        trace.push(["capture", ...args]);
        reads++;
        if (mode === "capture-error") throw new Error("capture");
        return { data: "c3ludGhldGlj" };
      },
    },
  };
  const decode = async (url: string) => {
    trace.push(["decode", url]);
    if (mode === "abort-capture") controller.abort();
    if (mode === "decode-error") throw new Error("decode");
    if (mode === "unknown" || (mode === "reset-absence" && reads === 3))
      return undefined;
    if (
      mode === "absent" ||
      mode === "page-changed-absent" ||
      mode === "final-origin" ||
      mode === "final-error" ||
      mode === "reset-absence"
    )
      return null;
    return {
      payload: reads < 3 ? "first" : "second",
      bounds: { x: 0, y: 0, width: 10, height: 10 },
    };
  };
  const wait = async () => {
    trace.push(["wait"]);
    if (++waits >= 12) controller.abort();
  };
  const params = { tab_id: "7" };
  const options: any = {
    abortSignal: controller.signal,
    completeWhenQrCodeDisappears: mode !== "no-completion",
    ctx: context,
    initialPayload: "initial",
    params,
    publishPayload(payload: string, complete?: boolean) {
      trace.push(["publish", payload, complete]);
      if (mode === "publish-error") throw new Error("publish");
    },
    async pageBindingStatus() {
      trace.push(["binding", ++checks]);
      if (mode === "binding-error" || (mode === "final-error" && checks === 2))
        throw new Error("binding");
      if (mode === "origin" || (mode === "final-origin" && checks === 2))
        return "origin_changed";
      if (mode.startsWith("page-changed")) return "page_changed";
      return null;
    },
  };
  const original = originalServiceBindings(["oJ", "iJ"], {
    W: positiveTabId,
    xf: decode,
    X_: wait,
    tJ: 8,
    nJ: 3,
    rJ: 2000,
    an: "jpeg",
  });
  let error;
  try {
    await (source ? original.oJ : createAuthQrMonitor(decode, wait).poll)(
      options,
    );
  } catch (e) {
    error = (e as Error).message;
  }
  return { trace, error };
}
test("QR monitor matches original publication, absence confirmation, retry and abort traces", async () => {
  for (const mode of [
    "normal",
    "absent",
    "unknown",
    "reset-absence",
    "origin",
    "page-changed-present",
    "page-changed-absent",
    "final-origin",
    "final-error",
    "binding-error",
    "capture-error",
    "decode-error",
    "abort-capture",
    "publish-error",
    "no-completion",
  ])
    assert.deepEqual(
      await scenario(false, mode),
      await scenario(true, mode),
      mode,
    );
  const absent = await scenario(false, "absent");
  assert.deepEqual(absent.trace.at(-1), ["publish", "initial", true]);
  assert.equal(absent.trace.filter((e) => e[0] === "capture").length, 3);
  assert.equal(
    (await scenario(false, "page-changed-present")).trace.filter(
      (e) => e[0] === "publish",
    ).length,
    0,
  );
  assert.equal(
    (await scenario(false, "reset-absence")).trace.filter(
      (e) => e[0] === "capture",
    ).length,
    6,
  );
});
test("QR start publishes synchronously and stop interrupts the real cadence wait", async () => {
  const publications: any[] = [];
  const monitor = createAuthQrMonitor(async () => null);
  const handle = monitor.start({
    initialQrCode: {
      payload: "initial",
      bounds: { x: 0, y: 0, width: 1, height: 1 },
    },
    completeWhenQrCodeDisappears: true,
    ctx: {
      cdp: {
        async call() {
          return { data: "" };
        },
      },
    },
    params: { tab_id: "7" },
    async pageBindingStatus() {
      return null;
    },
    publishPayload(...args: any[]) {
      publications.push(args);
    },
  });
  assert.deepEqual(publications, [["initial"]]);
  handle.stop();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(publications, [["initial"]]);
  const controller = new AbortController();
  const waiting = waitAuthQrPoll(Date.now(), controller.signal);
  controller.abort();
  await waiting;
  await waitAuthQrPoll(Date.now() - 200, new AbortController().signal);
});

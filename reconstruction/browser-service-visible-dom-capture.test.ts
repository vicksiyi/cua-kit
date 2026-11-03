import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  createDomState,
  intersectClips,
  relativeClip,
} from "../packages/browser/src/service/input/dom_state";
import { createVisibleDomCapture } from "../packages/browser/src/service/input/visible_dom_capture";
import {
  childFrameTimeout,
  remainingDomTimeout,
  mainFrameKey,
} from "../packages/browser/src/service/input/visible_dom_frame";
import { inputTimeout } from "../packages/browser/src/service/input/input";
const clip = { left: 0, top: 0, right: 100, bottom: 100 };
async function run(source: boolean, mode: string) {
  const trace: any[] = [],
    state = createDomState();
  const frame = (ref: string) => ({
    ref,
    rect:
      mode === "offscreen"
        ? { left: 200, top: 200, right: 300, bottom: 300 }
        : clip,
    size: { width: 100, height: 100 },
    url: "https://fixture.test/" + ref,
  });
  const reader: any = {
    async capture(
      _cdp: any,
      target: any,
      chars: number,
      elements: number,
      viewport: any,
      reviewer: boolean,
      timeout: any,
    ) {
      trace.push([
        "capture",
        target,
        chars,
        elements,
        viewport,
        reviewer,
        timeout,
      ]);
      const root = target.frameId === "main";
      if (mode === (root ? "root-error" : "child-error"))
        throw Error("capture failed");
      if (mode === "no-capture") return null;
      return {
        viewport:
          mode === "no-intersection" && !root
            ? { left: 150, top: 150, right: 200, bottom: 200 }
            : clip,
        items:
          mode === "line-limit"
            ? Array.from({ length: 210 }, (_, i) => ({
                ref: String(i),
                line: `button node_id=${i}`,
              }))
            : [
                {
                  ref: "local",
                  line:
                    mode === "char-limit"
                      ? "X".repeat(20001)
                      : `button node_id=local ${target.frameId}`,
                },
              ],
        frameElements: root
          ? [frame("a"), frame("b")]
          : target.frameId === "a" && mode === "nested"
            ? [frame("nested")]
            : [],
      };
    },
    async frameId(
      _cdp: any,
      target: any,
      ref: string,
      timeout: number,
      reviewer: boolean,
    ) {
      trace.push(["frameId", target.frameId, ref, timeout, reviewer]);
      if (mode === "lookup-error") throw Error("lookup failed");
      return ref;
    },
    async findFrame(
      _cdp: any,
      target: any,
      children: any[],
      wanted: string,
      deadline: any,
      reviewer: boolean,
    ) {
      trace.push(["find", target.frameId, wanted, deadline, reviewer]);
      return mode === "missing-priority"
        ? undefined
        : children.find((x) => x.ref === wanted);
    },
  };
  const cdp: any = {
    addTabCleanupHandler(_fn: any) {
      trace.push("bind");
    },
    async call(...args: any[]) {
      trace.push(["call", ...args]);
      return { frameTree: { frame: { id: "main", loaderId: "loader" } } };
    },
    async targetForFrameOrAttach(...args: any[]) {
      trace.push(["attach", ...args]);
      if (mode === "attach-error") throw Error("attach failed");
      return { tabId: 7, sessionId: args[1] };
    },
  };
  const ref = originalServiceBindings(
    ["F", "W", "SD", "xD", "ED", "q_", "TD", "j_"],
    {
      lc: 20000,
      cc: 200,
      uY: 5000,
      lY: 50,
      wD: 1000,
      lD: state.bind,
      cD: state.beginSnapshot,
      dD: state.registerFrame,
      pD: state.registerNode,
      dY: reader.capture,
      CD: reader.frameId,
      pY: reader.findFrame,
      U_: relativeClip,
      L_: intersectClips,
      H_: childFrameTimeout,
      W_: remainingDomTimeout,
      fY: mainFrameKey,
      Ve: inputTimeout,
    },
  );
  const restored = createVisibleDomCapture(reader, state);
  const context: any = {
    cdp,
    acquireAuthority() {
      trace.push("authority");
      return {
        observeContent(url: string) {
          trace.push(["observe", url]);
          return {
            async assert() {
              trace.push("assert");
              if (mode === "denied") throw Error("denied");
            },
          };
        },
      };
    },
    security: {
      async currentTabUrl(id: number) {
        trace.push(["url", id]);
        return "https://fixture.test/";
      },
    },
  };
  const captured = new Set<string>();
  const now = Date.now;
  Date.now = () => 1000;
  try {
    let value;
    if (mode === "review")
      value = await (source ? ref.xD : restored.review)(
        { tab_id: "7", timeout_ms: 500 },
        context,
        "b",
        captured,
      );
    else if (
      [
        "priority",
        "missing-priority",
        "priority-main",
        "expired",
        "attach-error",
      ].includes(mode)
    )
      value = await (source ? ref.ED : restored.capture)(7, cdp, {
        credentialFrameId: mode === "priority-main" ? "main" : "b",
        timeoutMs: mode === "expired" ? 0 : 500,
      });
    else
      value = await (source ? ref.SD : restored.command)(
        { tab_id: mode === "invalid-tab" ? 0 : "7" },
        context,
      );
    let node;
    try {
      node = state.resolveNode(7, "1");
    } catch {}
    if (mode === "repeat") {
      const second = await (source ? ref.SD : restored.command)(
        { tab_id: "7" },
        context,
      );
      assert.equal(second, value);
    }
    return { value, trace, node, captured: [...captured] };
  } catch (e) {
    return { error: (e as Error).message, trace };
  } finally {
    Date.now = now;
  }
}
test("visible DOM aggregation matches original across limits, frame priorities, errors and reviewer isolation", async () => {
  for (const mode of [
    "normal",
    "nested",
    "root-error",
    "child-error",
    "no-capture",
    "line-limit",
    "char-limit",
    "offscreen",
    "no-intersection",
    "lookup-error",
    "priority",
    "missing-priority",
    "priority-main",
    "expired",
    "attach-error",
    "review",
    "denied",
    "invalid-tab",
    "repeat",
  ])
    assert.deepEqual(await run(false, mode), await run(true, mode), mode);
  assert.equal(
    (await run(false, "normal")).value,
    "button node_id=1 main\nbutton node_id=2 a\nbutton node_id=3 b",
  );
  assert.equal(
    (await run(false, "priority")).value,
    "button node_id=1 main\nbutton node_id=2 b\nbutton node_id=3 a",
  );
  assert.equal((await run(false, "line-limit")).value.split("\n").length, 200);
  assert.equal((await run(false, "char-limit")).value, "");
  assert.equal((await run(false, "review")).node, undefined);
  assert.deepEqual((await run(false, "review")).captured, ["main", "b", "a"]);
  assert.equal(
    (await run(false, "expired")).trace.filter((x) => x[0] === "attach").length,
    0,
  );
  const priority = (await run(false, "priority")).trace.filter(
    (x) => x[0] === "capture",
  );
  assert.deepEqual(priority[0].slice(2, 4), [15000, 150]);
  assert.equal(priority[1][6], 500);
});

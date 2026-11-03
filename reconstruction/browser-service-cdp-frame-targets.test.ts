import test from "node:test";
import assert from "node:assert/strict";
import {
  serviceClassMethod,
  originalServiceBindings,
} from "./service-source.ts";
import { frameTargetMethods } from "../packages/browser/dist/service/cdp/frame_target_methods.js";
import { lifecycleMethods } from "../packages/browser/dist/service/cdp/lifecycle_methods.js";
const bindings = originalServiceBindings([
  "Cv",
  "$t",
  "Uh",
  "HN",
  "xte",
  "Ete",
]);
const names = [
  ...Object.keys(frameTargetMethods),
  "setFrameSessionForFrame",
  "setFrameSessionTargetId",
  "rememberAttachedFrameTarget",
];
const original = new Function(
  ...Object.keys(bindings),
  "return {" + names.map((n) => serviceClassMethod("qh", n)).join(",") + "}",
)(...Object.values(bindings));
const rebuilt = { ...lifecycleMethods, ...frameTargetMethods };
function owner(methods: any, infos: any[] = []) {
  const o: any = {
    ...methods,
    trace: [],
    frameSessionsByTabId: new Map(),
    frameSessionsBySessionId: new Map(),
    attachedFrameTargetIdsByTabId: new Map(),
  };
  o.waitForTabAttachment = async (...args: any[]) => {
    o.trace.push(["wait", ...args]);
  };
  o.tryInitializeAttachedFrameSession = async (s: any, options: any) => {
    o.trace.push(["init", s.sessionId, options]);
  };
  o.callTarget = async (...args: any[]) => {
    o.trace.push(["call", ...args]);
    return args[1] === "Target.getTargets"
      ? { targetInfos: infos }
      : { backendNodeId: 7 };
  };
  o.api = {
    async attachTarget(...args: any[]) {
      o.trace.push(["attach", ...args]);
    },
  };
  return o;
}
function snapshot(o: any) {
  return {
    trace: o.trace,
    tabs: o.frameSessionsByTabId,
    sessions: o.frameSessionsBySessionId,
    targets: o.attachedFrameTargetIdsByTabId,
  };
}
test("frame target resolution preserves exact, unique URL, ambiguous and owner-validation branches", async () => {
  async function run(methods: any, mode: string) {
    const info = { type: "iframe", targetId: "t", url: "url" };
    const infos =
      mode === "ambiguous"
        ? [info, { ...info, targetId: "other" }]
        : mode === "wrongtab"
          ? [{ ...info, tabId: 2 }]
          : [info];
    const o = owner(methods, infos);
    const hint =
      mode === "parent"
        ? { url: "url", parentTarget: { tabId: 2 } }
        : { url: "url" };
    const result = await o.targetForFrameOrAttach(
      "1",
      mode === "exact" ? "t" : undefined,
      {},
      hint,
    );
    return { result, state: snapshot(o) };
  }
  for (const mode of ["exact", "url", "ambiguous", "wrongtab", "parent"])
    assert.deepEqual(await run(rebuilt, mode), await run(original, mode));
});
test("frame target attachment reuses session identity, rejects cross-tab and accepts provider-created sessions", async () => {
  async function run(methods: any, mode: string) {
    const o = owner(methods);
    const s = {
      frameId: null,
      sessionId: "target:t",
      target: { tabId: mode === "cross" ? 2 : 1, targetId: "t" },
      targetId: "t",
    };
    if (mode !== "during") o.frameSessionsBySessionId.set(s.sessionId, s);
    else
      o.api.attachTarget = async () => {
        o.frameSessionsBySessionId.set(s.sessionId, s);
      };
    const result = await o.attachDebuggerFrameTarget(1, "t", "f", {});
    const lookup = o.targetForFrame("1", "f");
    return {
      result,
      lookup,
      targetId: o.targetIdForFrame("1", "f"),
      same: o.frameSessionsBySessionId.get(s.sessionId) === s,
      state: snapshot(o),
    };
  }
  for (const mode of ["existing", "cross", "during"])
    assert.deepEqual(await run(rebuilt, mode), await run(original, mode));
});
test("frame resolution catches provider failures but propagates deadline checks", async () => {
  async function run(methods: any, mode: string) {
    const o = owner(methods, [{ type: "iframe", targetId: "t" }]);
    if (mode === "unsupported") delete o.api.attachTarget;
    if (mode === "failed")
      o.api.attachTarget = async () => {
        throw Error("provider");
      };
    if (mode === "query")
      o.callTarget = async () => {
        throw Error("query");
      };
    let result, error;
    try {
      result = await o.targetForFrameOrAttach(
        1,
        "t",
        mode === "expired" ? { deadlineMs: 0 } : {},
      );
    } catch (e) {
      error = (e as Error).message;
    }
    return { result, error, state: snapshot(o) };
  }
  for (const mode of ["unsupported", "failed", "query", "expired"])
    assert.deepEqual(await run(rebuilt, mode), await run(original, mode));
});

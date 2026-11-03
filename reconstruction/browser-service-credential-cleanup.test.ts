import test from "node:test";
import assert from "node:assert/strict";
import { serviceClassMethod } from "./service-source";
import { CredentialLeaseCleanup } from "../packages/browser/src/service/credentials/lease_cleanup";
const methods = [
  "navigateToBrowserBlank",
  "quiesceWebsite",
  "rejectOrdinaryRequest",
  "close",
  "dispose",
  "stopPausedTarget",
  "stopPausedTargets",
];
const Original = new Function(
  `return class {${methods.map((name) => serviceClassMethod("Z_", name)).join("\n")}}`,
)();
function fixture(Class: any, mode: string) {
  const trace: any[] = [];
  const owner = Object.create(Class.prototype);
  let reads = 0;
  Object.assign(owner, {
    tabId: 7,
    frameId: "root",
    detached: mode === "detached",
    discardRejectedHistory: mode === "discard",
    pausedTargets: new Set(),
    closingTargets: new Map(),
    active: new Map(),
    onEvent() {},
    onTabDetached() {},
    onRequestResolution() {},
    unblockRawEvents() {
      trace.push("unblock");
    },
    setOutcome(...args: any[]) {
      trace.push(["outcome", ...args]);
    },
    requests: {
      removeListener(name: string) {
        trace.push(["remove-request", name]);
      },
    },
  });
  owner.active.set(7, owner);
  owner.cdp = {
    async call(_id: number, method: string, params: any, options: any) {
      trace.push([method, params, options]);
      if (method === "Page.getFrameTree") {
        reads++;
        return {
          frameTree: {
            frame: {
              id: mode === "wrong-frame" ? "other" : "root",
              loaderId: reads === 1 || mode === "old-loader" ? "old" : "new",
              url: mode === "wrong-url" ? "https://x/" : "about:blank",
              ...(mode === "unreachable"
                ? { unreachableUrl: "https://x/" }
                : {}),
            },
          },
        };
      }
      if (method === "Page.navigate")
        return {
          frameId: "root",
          loaderId: mode === "missing-loader" ? undefined : "new",
          isDownload: mode === "download",
          errorText: mode === "navigate-error" ? "failed" : undefined,
        };
      return {};
    },
    async waitForEvent(_id: number, predicate: any, options: any) {
      trace.push(["wait", options]);
      for (const params of [
        { frame: { id: "root", url: "about:blank" } },
        { frame: { id: "root", url: "about:blank", parentId: "other" } },
        { frame: { id: "root", url: "about:blank", unreachableUrl: "x" } },
        { frame: null },
      ])
        for (const source of [
          { tabId: 7 },
          { tabId: 7, sessionId: "child" },
          { tabId: 7, targetId: "other" },
        ])
          trace.push([
            "predicate",
            predicate({ method: "Page.frameNavigated", source, params }),
          ]);
      if (mode === "wait-error") throw Error("timeout");
    },
    async closeBrowserAuthPausedTarget(_id: number, target: string) {
      trace.push(["close-target", target]);
      return mode !== "target-error";
    },
    removeListener(name: string) {
      trace.push(["remove-event", name]);
    },
  };
  return { owner, trace };
}
async function quiesce(Class: any, mode: string) {
  const { owner, trace } = fixture(Class, mode);
  let error;
  try {
    const a = owner.navigateToBrowserBlank();
    assert.equal(a, owner.navigateToBrowserBlank());
    await a;
  } catch (e) {
    error = (e as Error).message;
  }
  await Promise.resolve();
  return { trace, error, cached: owner.blankNavigationPromise != null };
}
test("credential quiescence matches original frame/loader checks, root events, cached promise and history reset", async () => {
  for (const mode of [
    "normal",
    "discard",
    "detached",
    "wrong-frame",
    "old-loader",
    "wrong-url",
    "unreachable",
    "missing-loader",
    "download",
    "navigate-error",
    "wait-error",
  ])
    assert.deepEqual(
      await quiesce(CredentialLeaseCleanup, mode),
      await quiesce(Original, mode),
      mode,
    );
  assert.equal(
    (await quiesce(CredentialLeaseCleanup, "normal")).error,
    undefined,
  );
  assert.equal(
    (await quiesce(CredentialLeaseCleanup, "old-loader")).cached,
    false,
  );
});
async function cleanup(Class: any, mode: string) {
  const { owner, trace } = fixture(Class, mode);
  owner.pausedTargets.add("target");
  for (const name of [
    "removeWorkerProtection",
    "removeNewPageProtection",
    "removeWorkerBypass",
    "removeInterceptor",
  ])
    owner[name] = async () => {
      trace.push(name);
    };
  let error;
  try {
    const a = owner.close();
    assert.equal(a, owner.close());
    await a;
  } catch (e) {
    error = (e as Error).message;
  }
  await Promise.resolve();
  return {
    trace,
    error,
    active: owner.active.has(7),
    paused: [...owner.pausedTargets],
    closing: owner.closingTargets.size,
    cached: owner.closePromise != null,
  };
}
test("credential cleanup preserves target drain, protection release, ownership and failure retry cache", async () => {
  for (const mode of ["normal", "detached", "target-error"])
    assert.deepEqual(
      await cleanup(CredentialLeaseCleanup, mode),
      await cleanup(Original, mode),
    );
  const done = await cleanup(CredentialLeaseCleanup, "normal");
  assert.equal(done.active, false);
  assert.equal(done.trace.at(-1), "unblock");
  assert.equal(
    (await cleanup(CredentialLeaseCleanup, "target-error")).active,
    true,
  );
});
test("ordinary rejection schedules blank/history cleanup only for the matching main document", async () => {
  async function run(Class: any, resourceType: string, frameId: string) {
    const { owner, trace } = fixture(Class, "normal");
    const result = owner.rejectOrdinaryRequest(
      { resourceType, frameId },
      "submission_failed",
      { reason: "fixture" },
    );
    if (owner.rejectedDocumentCleanup) {
      await owner.rejectedDocumentCleanup;
      await owner.close();
    }
    return { result, trace, discard: owner.discardRejectedHistory };
  }
  for (const [type, id] of [
    ["Document", "root"],
    ["Document", "child"],
    ["Script", "root"],
  ])
    assert.deepEqual(
      await run(CredentialLeaseCleanup, type, id),
      await run(Original, type, id),
    );
  assert.equal(
    (await run(CredentialLeaseCleanup, "Document", "root")).discard,
    true,
  );
});

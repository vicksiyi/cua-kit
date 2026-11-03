import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { originalServiceBindings } from "./service-source";
import { waitForNetworkIdle } from "../packages/browser/src/service/cdp/network_idle";
import { rejectBlockedNavigation } from "../packages/browser/src/service/cdp/page_load";
const original = originalServiceBindings(["T2", "Hn", "Rv", "At"], {
  wte: "Page.navigationBlocked",
  Wn: rejectBlockedNavigation,
});
async function scenario(run: typeof waitForNetworkIdle, mode: string) {
  const cdp = new EventEmitter() as EventEmitter & {
    call: (...args: any[]) => Promise<any>;
  };
  const calls: any[] = [];
  const emit = (method: string, params: any, source: any = { tabId: 7 }) =>
    cdp.emit("event", { method, params, source });
  const idle = (loaderId = "a", source?: any) =>
    emit(
      "Page.lifecycleEvent",
      { name: "networkIdle", frameId: "root", loaderId },
      source,
    );
  cdp.call = async (_id, method, params, options) => {
    calls.push([method, params, options.preserveDebuggerOnTimeout]);
    if (method === "Page.getFrameTree") {
      if (mode === "buffered") idle();
      return { frameTree: { frame: { id: "root", loaderId: "a" } } };
    }
    if (method === "Page.setLifecycleEventsEnabled") {
      if (mode === "idle") idle();
      if (mode === "detach") cdp.emit("tabDetached", 7);
      if (mode === "blocked")
        emit("Page.navigationBlocked", {
          url: "https://example.com/?secret=x",
          resourceType: "mainFrame",
        });
      if (mode === "wrong-session") idle("a", { tabId: 7, sessionId: "child" });
      if (mode === "wrong-loader") idle("old");
      if (mode === "new-loader") {
        idle();
        emit("Page.frameNavigated", { frame: { id: "root", loaderId: "b" } });
        idle("a");
        setTimeout(() => idle("b"), 2);
      }
    }
    return {};
  };
  let error: string | undefined;
  try {
    // Successful asynchronous events need scheduling headroom under the full suite.
    // Timeout/rejection cases retain their short deadline and original assertions.
    await run(
      cdp,
      7,
      ["idle", "buffered", "new-loader"].includes(mode) ? 1000 : 25,
    );
  } catch (e) {
    error = (e as Error).message;
  }
  assert.equal(cdp.listenerCount("event"), 0);
  assert.equal(cdp.listenerCount("tabDetached"), 0);
  return { calls, error };
}
test("network idle matches original frame/loader tracking, buffered events, rejection and cleanup", async () => {
  for (const mode of [
    "idle",
    "buffered",
    "new-loader",
    "detach",
    "blocked",
    "wrong-session",
    "wrong-loader",
    "timeout",
  ]) {
    const actual = await scenario(waitForNetworkIdle, mode);
    assert.deepEqual(actual, await scenario(original.T2, mode), mode);
    if (["idle", "buffered", "new-loader"].includes(mode))
      assert.equal(actual.error, undefined);
    else assert.ok(actual.error, mode);
  }
});

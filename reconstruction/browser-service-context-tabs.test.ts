import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source.ts";
import { ServiceTabs } from "../packages/browser/dist/service/context/tabs.js";
import { TabLifecycle } from "../packages/browser/dist/service/context/tab_lifecycle.js";
import { BrowserUi } from "../packages/browser/dist/service/context/ui.js";
const original = originalServiceBindings(["gg", "Tg", "bg"]);
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
test("service tab inventory retains strict identity, active selection, exact errors and provider arguments", async () => {
  async function run(Class: any) {
    const trace: any[] = [];
    let tabs: any[] = [
      { id: 1, title: "", url: null, active: true },
      { id: 2, title: null, url: "url", active: true },
    ];
    const api = {
      async createTab(...args: any[]) {
        trace.push(["create", ...args]);
        return tabs[0];
      },
      async getTabs() {
        return tabs;
      },
      async markTab(...args: any[]) {
        trace.push(["mark", ...args]);
        return "discarded";
      },
    };
    const o = new Class(api, 7);
    const results = [
      await o.create(),
      await o.mark(1, { x: 1 }),
      await o.getActive(),
      await o.get(2),
      await outcome(() => o.get("1")),
    ];
    const identity = (await o.list()) === tabs;
    tabs = [];
    results.push(
      await outcome(() => o.get(1)),
      await outcome(() => o.getActive()),
    );
    return { results, identity, trace, fields: Object.keys(o) };
  }
  assert.deepEqual(await run(ServiceTabs), await run(original.gg));
});
test("tab lifecycle isolates sessions, refreshes turn claims, drains events and retains created duplicates", () => {
  function run(Class: any) {
    let session = "a",
      turn: any = "one";
    const o = new Class({
      getCurrentSessionId: () => session,
      getCurrentTurnId: () => turn,
    });
    const results = [];
    o.recordAcquired(1);
    o.recordAcquired(1, "agent");
    o.recordCreated(2);
    o.recordCreated(2);
    results.push(o.takeEvents(), o.takeEvents(), o.needsReclaim(1));
    turn = "two";
    results.push(o.needsReclaim(1));
    o.recordAcquired(1);
    results.push(o.needsReclaim(1), o.takeEvents());
    session = "b";
    results.push(o.needsReclaim(1));
    o.recordCreated(1);
    turn = null;
    results.push(o.needsReclaim(1));
    session = "c";
    results.push(o.needsReclaim(99), o.sessions.has("c"));
    return { results, sessions: o.sessions, fields: Object.keys(o) };
  }
  assert.deepEqual(run(TabLifecycle), run(original.Tg));
});
test("browser UI wait flag preserves detached operation timing and swallows sync/async provider errors", async () => {
  async function run(Class: any, flag: any) {
    const trace: any[] = [];
    let release: any;
    const pending = new Promise<void>((resolve) => (release = resolve));
    const o = new Class({
      moveMouse(request: any) {
        trace.push(request);
        return pending;
      },
    });
    let done = false;
    const result = o.moveMouse(1, 2, 3, { waitForArrival: flag }).then(() => {
      done = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    const before = done;
    release();
    await result;
    for (const sync of [true, false]) {
      o.api = {
        moveMouse() {
          if (sync) throw Error("sync");
          return Promise.reject(Error("async"));
        },
      };
      await o.moveMouse(1, 2, 3, { waitForArrival: flag });
    }
    return { trace, before, done, fields: Object.keys(o) };
  }
  for (const flag of [undefined, true, false])
    assert.deepEqual(await run(BrowserUi, flag), await run(original.bg, flag));
});

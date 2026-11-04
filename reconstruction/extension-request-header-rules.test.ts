import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createRequestHeaderRulesClass } from "../packages/browser-extension/src/request_header_rules";
function fixture(original: boolean) {
  const trace: any[] = [];
  const state = {
    queryError: false,
    readError: false,
    updateError: false,
    tabs: [{ id: 1 }, { id: 2 }, { id: 0 }],
    rules: [
      { id: 999999 },
      { id: 1000000 },
      { id: 1004999 },
      { id: 1005000 },
    ] as any[],
  };
  const dnr: any = {
    ResourceType: {
      MAIN_FRAME: "main_frame",
      SUB_FRAME: "sub_frame",
      OBJECT: "object",
    },
    RuleActionType: { MODIFY_HEADERS: "modifyHeaders" },
    HeaderOperation: { SET: "set" },
    async getSessionRules() {
      trace.push(["getRules"]);
      if (state.readError) throw Error("read denied");
      return state.rules;
    },
    async updateSessionRules(update: any) {
      trace.push(["updateRules", structuredClone(update)]);
      if (state.updateError) throw Error("update denied");
      state.rules = [
        ...state.rules.filter(
          (rule) => !update.removeRuleIds.includes(rule.id),
        ),
        ...update.addRules,
      ];
    },
  };
  const chrome: any = {
    declarativeNetRequest: dnr,
    runtime: { id: "extension-id" },
    tabs: {
      async query(options: any) {
        trace.push(["queryTabs", options]);
        if (state.queryError) throw Error("query denied");
        return state.tabs;
      },
    },
  };
  const error = (...args: any[]) => trace.push(["error", ...args]);
  const Class = original
    ? extensionBindings(["ui", "Lu", "vy"], { chrome, console: { error } }).vy
    : createRequestHeaderRulesClass({ chrome, error });
  return { rules: new Class(), state, trace, chrome, dnr };
}
const config = (sessionId = "s", value = "value") => ({
  sessionId,
  headers: [{ name: "x-agent", value }],
});
async function compare(run: (f: ReturnType<typeof fixture>) => Promise<any>) {
  const a = fixture(true),
    b = fixture(false);
  assert.deepEqual(await run(b), await run(a));
  assert.deepEqual(b.trace, a.trace);
  assert.deepEqual(b.state.rules, a.state.rules);
  assert.equal(b.rules.appliedRules, a.rules.appliedRules);
  assert.equal(b.rules.failureReported, a.rules.failureReported);
  return b;
}
test("extension request-header rules preserve grouping, deterministic IDs, ownership range and cache", async () => {
  const f = await compare(async ({ rules }) => {
    const active = new Map<any, any>([
      [2, config()],
      [1, config()],
      [0, config("other")],
      [99, config()],
      [-1, config()],
      [1.5, config()],
      ["1", config()],
      [Infinity, config()],
    ]);
    const results = [
      await rules.readOwnedRuleIds(),
      await rules.synchronize(active),
      await rules.synchronize(active),
      await rules.synchronize(active, true),
    ];
    results.push(
      await rules.synchronize(new Map()),
      await rules.synchronize(new Map()),
    );
    return results;
  });
  const updates = f.trace.filter((entry) => entry[0] === "updateRules");
  assert.equal(updates.length, 3);
  assert.deepEqual(updates[0][1].removeRuleIds, [1000000, 1004999]);
  assert.equal(updates[0][1].addRules.length, 4);
  const secondOfPair = updates[0][1].addRules[1];
  assert.deepEqual(secondOfPair.condition.excludedInitiatorDomains, [
    "extension-id",
  ]);
  assert.deepEqual(
    f.state.rules.map((rule) => rule.id),
    [999999, 1005000],
  );
});
test("extension rule failures retain operation-specific errors, one-shot logging and successful reset", async () => {
  await compare(async ({ rules, state, chrome, dnr }) => {
    const active = new Map([[1, config()]]),
      results: any[] = [];
    const capture = async (force = false) => {
      const error = await rules.synchronize(active, force);
      results.push(error?.message ?? null);
    };
    chrome.declarativeNetRequest = undefined;
    results.push(await rules.synchronize(new Map()));
    await capture();
    await capture();
    chrome.declarativeNetRequest = dnr;
    await capture();
    state.queryError = true;
    await capture(true);
    await capture(true);
    state.queryError = false;
    await capture(true);
    state.readError = true;
    await capture(true);
    state.readError = false;
    state.updateError = true;
    await capture();
    state.updateError = false;
    await capture();
    state.updateError = true;
    results.push((await rules.synchronize(new Map()))?.message);
    state.updateError = false;
    return results;
  });
});
test("extension rule capacity and malformed configurations fail like original without partial installation", async () => {
  const f = await compare(async ({ rules }) => {
    const results: any[] = [];
    for (const count of [2500, 2501]) {
      const active = new Map(
        Array.from({ length: count }, (_, i) => [i, config(`session:${i}`)]),
      );
      results.push((await rules.synchronize(active))?.message ?? null);
    }
    results.push(
      (
        await rules.synchronize(
          new Map([[1, { sessionId: "s", headers: null }]]),
        )
      )?.message,
    );
    const cyclic: any = config();
    cyclic.self = cyclic;
    results.push((await rules.synchronize(new Map([[1, cyclic]])))?.message);
    return results;
  });
  assert.equal(f.trace.filter((entry) => entry[0] === "updateRules").length, 1);
  assert.equal(
    f.state.rules.filter((rule) => rule.id >= 1000000 && rule.id <= 1004999)
      .length,
    5000,
  );
});

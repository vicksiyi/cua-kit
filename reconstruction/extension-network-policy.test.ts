import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createNetworkPolicyManagerClass } from "../packages/browser-extension/src/network_policy";
const types = [
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "object",
  "xmlhttprequest",
  "ping",
  "csp_report",
  "media",
  "websocket",
  "webtransport",
  "webbundle",
  "other",
];
const policy = {
  defaultAction: "block",
  rules: [
    { action: "allow", regex: "^https://allowed" },
    { action: "block", regex: "^https://blocked" },
  ],
};
const normalize = (error: any): any => ({
  name: error.name,
  message: error.message,
  ...(error.errors
    ? { errors: error.errors.map(normalize), cause: normalize(error.cause) }
    : {}),
});
const outcome = async (run: () => any) => {
  try {
    return { value: await run() };
  } catch (error) {
    return { error: normalize(error) };
  }
};
function fixture(original: boolean) {
  const trace: any[] = [];
  let rules: any[] = [
    { id: 1000000, condition: { tabIds: [1] } },
    { id: 2000000, condition: { tabIds: [99] } },
  ];
  const state = {
    permission: true,
    missingTypes: false,
    mismatch: false,
    keepRemoved: false,
    failEnforce: false,
    hold: false,
    failUpdate: false,
  };
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>((resolve) => {
      enter = resolve;
    }),
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
  const dnr: any = {
    get ResourceType() {
      return Object.fromEntries(
        (state.missingTypes ? types.slice(1) : types).map((type) => [
          type,
          type,
        ]),
      );
    },
    RuleActionType: { ALLOW: "allow", BLOCK: "block" },
    async getSessionRules() {
      trace.push(["getRules"]);
      return structuredClone(rules).map((rule) =>
        state.mismatch && rule.action ? { ...rule, priority: 99 } : rule,
      );
    },
    async updateSessionRules(update: any) {
      trace.push(["update", structuredClone(update)]);
      if (state.failUpdate) throw Error("update failed");
      if (!state.keepRemoved)
        rules = rules.filter(
          (rule) => !update.removeRuleIds?.includes(rule.id),
        );
      rules.push(...(update.addRules ?? []));
    },
  };
  const chrome: any = {
    tabs: {
      onRemoved: {
        addListener() {
          trace.push(["listen"]);
        },
      },
      async get(id: number) {
        trace.push(["getTab", id]);
        return { id };
      },
      async query(options: any) {
        trace.push(["query", options]);
        return [{ id: 1 }, { id: 2 }];
      },
    },
    permissions: {
      async contains(value: any) {
        trace.push(["permission", value]);
        return state.permission;
      },
    },
    declarativeNetRequest: dnr,
  };
  const host = {
    chrome,
    now: () => 100,
    compile(constraints: any[]) {
      trace.push(["compile", constraints]);
      return constraints[0];
    },
    predicate(constraints: any[]) {
      trace.push(["predicate", constraints]);
      return (_url: string) => true;
    },
    async enforceActivePage(id: number, deadline: number, allowed: any) {
      trace.push(["enforce", id, deadline, allowed("https://fixture")]);
      enter();
      if (state.hold) await gate;
      if (state.failEnforce) throw Error("enforce failed");
    },
  };
  const Class = original
    ? extensionBindings(["ar", "_d", "mi", "oE"], {
        chrome,
        Date: { now: host.now },
        Vp: host.compile,
        Wp: host.predicate,
        JS: host.enforceActivePage,
        md: 2000000,
        Ga: 2999999,
        aE: "^(?:https?|wss?)://",
        gd: undefined,
      }).ar
    : createNetworkPolicyManagerClass(host as any);
  return {
    manager: new Class(),
    Class,
    state,
    trace,
    chrome,
    dnr,
    entered,
    release,
    get rules() {
      return rules;
    },
    set rules(value: any[]) {
      rules = value;
    },
  };
}
async function compare(run: (f: ReturnType<typeof fixture>) => Promise<any>) {
  const a = fixture(true),
    b = fixture(false);
  assert.deepEqual(
    Object.getOwnPropertyNames(b.Class.prototype),
    Object.getOwnPropertyNames(a.Class.prototype),
  );
  assert.deepEqual(await run(b), await run(a));
  assert.deepEqual(b.trace, a.trace);
  assert.deepEqual(b.rules, a.rules);
  assert.deepEqual(b.manager.attaching, a.manager.attaching);
  assert.deepEqual(b.manager.attachedPolicies, a.manager.attachedPolicies);
  return b;
}
test("extension network policy retains validation, priority, install acknowledgement and owned removal", async () => {
  const f = await compare(async ({ manager: m, Class }) => {
    const results = [];
    for (const tabId of [0, -1, 1.5, "1"])
      results.push(
        await outcome(() => m.attach(tabId, { constraints: [policy] })),
      );
    for (const timeoutMs of [0, 30001, 1.5, NaN, "5"])
      results.push(
        await outcome(() => m.attach(1, { timeoutMs, constraints: [policy] })),
      );
    await m.attach(1, { constraints: [{ defaultAction: "allow", rules: [] }] });
    await m.attach(1, { timeoutMs: 10, constraints: [policy] });
    await m.attach(1, { constraints: [policy] });
    results.push(
      await outcome(() =>
        m.attach(1, { constraints: [{ defaultAction: "block", rules: [] }] }),
      ),
    );
    await m.detach(1);
    await m.detachAll();
    results.push(Class.getInstance() === Class.getInstance());
    return results;
  });
  assert.deepEqual(
    f.rules.map((rule) => rule.id),
    [1000000],
  );
  const installed = f.trace.find(
    (entry) => entry[0] === "update" && entry[1].addRules,
  )[1].addRules;
  assert.deepEqual(
    installed.map((rule: any) => rule.priority),
    [1, 2, 3],
  );
});
test("extension network policy preserves permission, API, resource and acknowledgement failures", async () => {
  for (const mode of [
    "permission",
    "unavailable",
    "missingTypes",
    "mismatch",
    "failEnforce",
    "failUpdate",
    "existing",
  ])
    await compare(async (f) => {
      if (mode === "permission") f.state.permission = false;
      else if (mode === "unavailable")
        f.chrome.declarativeNetRequest = undefined;
      else if (mode === "existing")
        f.rules.push({ id: 2000002, condition: { tabIds: [1] } });
      else (f.state as any)[mode] = true;
      return await outcome(() =>
        f.manager.attach(1, { constraints: [policy] }),
      );
    });
});
test("extension network policy cancels in-flight enforcement and aggregates failed rollback", async () => {
  await compare(async (f) => {
    f.state.hold = true;
    const pending = outcome(() =>
      f.manager.attach(1, { constraints: [policy] }),
    );
    await f.entered;
    const repeated = await outcome(() =>
      f.manager.attach(1, { constraints: [policy] }),
    );
    await f.manager.detach(1);
    f.release();
    return [repeated, await pending];
  });
  await compare(async (f) => {
    f.rules = [{ id: 1000000, condition: { tabIds: [1] } }];
    f.state.failEnforce = true;
    f.state.keepRemoved = true;
    return await outcome(() => f.manager.attach(1, { constraints: [policy] }));
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings, serviceSourceSha256 } from "./service-source";
import * as permissions from "../packages/browser/src/service/preferences/persisted_permissions";
import { Preferences } from "../packages/browser/src/service/preferences/preferences";
assert.equal(
  serviceSourceSha256,
  "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021",
);
const original = originalServiceBindings(
  ["Yoe", "uie", "lie", "ML", "du", "Cg"],
  {
    xS: permissions.permissionTableKey,
    TS: permissions.validPreferenceSession,
    es: permissions.isRecord,
    Jc: "allowed",
    cu: "denied",
    pie: permissions.escapePermissionPattern,
    cie: permissions.permissionTarget,
    km: permissions.storedOriginMatches,
  },
);
function store(initial: any = {}) {
  let value = structuredClone(initial);
  const reads: any[] = [];
  return {
    reads,
    get: async (key: string) => value[key],
    set: async (key: string, v: any) => {
      value[key] = v;
    },
    readSnapshot: async (opts: any) => {
      reads.push(opts);
      return structuredClone(value);
    },
    update: async (fn: any) => {
      value = fn(value);
    },
    snapshot: () => structuredClone(value),
  };
}
test("SIWC persistent entries match original exact account/origin pairs without wildcard escaping", async () => {
  const resource = {
    kind: "siwc",
    accountKey: "account*\\key",
    origin: "https://site.test",
  };
  const raw = JSON.stringify([resource.accountKey, resource.origin]);
  for (const scope of ["global", "conversation"])
    for (const decision of ["approve", "deny"]) {
      const results = [];
      for (const persist of [original.Yoe, permissions.persistPermission]) {
        const global = store({ siwc: { allowed: [raw], denied: [raw] } }),
          session = store();
        await persist(
          { global, session: () => session },
          { resource, preferenceSessionId: "session" },
          scope,
          decision,
        );
        results.push({
          global: global.snapshot(),
          session: session.snapshot(),
        });
      }
      assert.deepEqual(results[1], results[0]);
    }
  for (const candidate of [
    raw,
    " " + raw,
    JSON.stringify(["*", resource.origin]),
    JSON.stringify([resource.accountKey, "https://*.test"]),
    permissions.escapePermissionPattern(raw),
  ]) {
    const table = { allowed: [candidate] };
    assert.equal(
      permissions.tableMatchesResource(table, "allowed", resource),
      original.Cg(table, "allowed", resource),
    );
    assert.equal(
      permissions.tableMatchesResource(table, "allowed", resource),
      candidate === raw,
    );
  }
});
test("SIWC preferences persist only explicit scope and refresh account-isolated decisions", async () => {
  const global = store(),
    session = store();
  const config = {
    global,
    session: () => session,
    readRequirements: async () => null,
    readAll: async () => ({config: {}}),
  };
  const prefs = new Preferences(config, {
    env: {},
    requestMeta: { session_id: "session", turn_id: "turn" },
  });
  const target = { accountKey: "alice", origin: "https://site.test" };
  assert.equal(await prefs.getSiwcPermission(target), null);
  await prefs.handleSiwcPromptResult(target, { action: "accept" });
  assert.equal(
    await prefs.getSiwcPermission(target),
    null,
    "no implicit SIWC persistence",
  );
  await prefs.handleSiwcPromptResult(target, {
    action: "accept",
    _meta: { persist: "session" },
  });
  assert.deepEqual(await prefs.getSiwcPermission(target), {
    decision: "approve",
    scope: "conversation",
    source: "browser-use-persisted-state",
  });
  assert.equal(
    await prefs.getSiwcPermission({ ...target, accountKey: "bob" }),
    null,
  );
  await prefs.handleSiwcPromptResult(target, {
    action: "decline",
    _meta: { persist: "always" },
  });
  assert.deepEqual(await prefs.getSiwcPermission(target), {
    decision: "deny",
    scope: "global",
    source: "browser-use-persisted-state",
  });
  assert(global.reads.length > 0 && session.reads.length > 0);
  assert(
    [...global.reads, ...session.reads].every(
      (options) => options.refresh === true,
    ),
  );
  const before = session.snapshot();
  await prefs.handleSiwcPromptResult(target, {
    action: "cancel",
    _meta: { persist: "session" },
  });
  assert.deepEqual(session.snapshot(), before);
});

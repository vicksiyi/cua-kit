import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source.ts";
import * as readable from "../packages/browser/dist/service/preferences/persisted_permissions.js";
const original = originalServiceBindings(
  [
    "rl",
    "sp",
    "nl",
    "ap",
    "tl",
    "Y8",
    "ip",
    "FC",
    "J8",
    "Z8",
    "MC",
    "Py",
    "Q8",
    "NC",
    "e5",
    "Ry",
    "t5",
    "Cs",
    "r5",
    "n5",
    "o5",
    "i5",
    "Iy",
    "LC",
    "lp",
    "IC",
    "Cy",
    "K8",
    "dn",
    "Qoe",
    "wg",
    "rie",
    "PL",
    "nie",
    "bS",
    "yS",
    "vg",
    "oie",
    "wL",
    "RL",
    "iie",
    "EL",
    "wS",
    "_L",
    "die",
    "pie",
    "vL",
    "_g",
    "mie",
    "fie",
    "hie",
    "ts",
  ],
  {
    DC: new TextEncoder(),
    OC: 42,
    X8: 63,
    SL: "approval_mode",
    Koe: "download_approval_mode",
    Xoe: "upload_approval_mode",
    Xc: "never_ask",
    $oe: "disabled",
    Hoe: "iab_history_approval_mode",
    joe: "history_approval_mode",
    xL: "origins",
    Voe: "downloads",
    zoe: "uploads",
    Goe: "full_cdp",
    iL: "browser_use_persistent_approval_scope",
    sL: "all-sites",
    Kc: "allowed",
    uu: "denied",
  },
);
test("persisted permission matching retains escaped wildcard and origin/host fallback distinctions", () => {
  for (const kind of ["origin", "fileTransfer", "fullCdp"])
    for (const origin of [
      "https://EXAMPLE.com:443",
      "https://u:p@example.com:80/path?x=1",
      "file:///tmp/a*b",
      "codex-sandbox://a.web-sandbox.oaiusercontent.com",
      "literal*\\text",
    ]) {
      const resource = { kind, origin },
        target = readable.permissionTarget(resource);
      assert.deepEqual(target, original.mie(resource));
      assert.equal(
        readable.escapePermissionPattern(origin),
        original.hie(origin),
      );
      for (const entry of [
        "*",
        "*.com",
        "https://example.com",
        "https://*.com",
        "EXAMPLE.com:443",
        "file:///tmp/a\\*b",
        "literal\\*\\\\text",
        " ? ",
        42,
      ])
        assert.equal(
          readable.tableMatchesPermission(
            { allowed: [entry] },
            "allowed",
            target,
          ),
          original._g({ allowed: [entry] }, "allowed", original.mie(resource)),
        );
    }
  for (const pattern of ["a*b*c", "a\\*b", "a\\\\b", "a?b", "**", "", "*a*a"])
    for (const value of ["abc", "a*b", "a\\b", "acb", "aa", "", "ABC"])
      assert.equal(
        readable.persistedPatternMatches(pattern, value),
        original.Cy(pattern, value),
      );
});
test("permission persistence clones only selected table and updates raw/escaped opposite entries", async () => {
  async function run(
    fn: any,
    initial: any,
    scope: string,
    sessionId: string,
    decision: string,
  ) {
    const originalSnapshot = structuredClone(initial);
    let result: any, selected: string | undefined;
    const store = {
      update: async (transform: any) => {
        result = transform(originalSnapshot);
      },
    };
    try {
      await fn(
        {
          global: store,
          session: (id: string) => {
            selected = id;
            return store;
          },
        },
        {
          resource: { kind: "origin", origin: "https://a*b.com" },
          preferenceSessionId: sessionId,
        },
        scope,
        decision,
      );
      return {
        result,
        initial: originalSnapshot,
        selected,
        copied: result
          ? [
              result !== originalSnapshot,
              result.origins !== originalSnapshot.origins,
              result.other === originalSnapshot.other,
            ]
          : [],
      };
    } catch (error: any) {
      return { error: error.message, initial: originalSnapshot };
    }
  }
  for (const initial of [
    {},
    {
      other: {},
      origins: {
        allowed: [1, "keep"],
        denied: ["https://a*b.com", "https://a\\*b.com", 4, "keep"],
      },
    },
    { origins: [] },
    { origins: { allowed: "invalid" } },
  ])
    for (const scope of ["global", "conversation"])
      for (const session of ["valid_1", "../bad"])
        for (const decision of ["approve", "deny"])
          assert.deepEqual(
            await run(
              readable.persistPermission,
              initial,
              scope,
              session,
              decision,
            ),
            await run(original.Qoe, initial, scope, session, decision),
          );
});
test("permission snapshots preserve refresh semantics, parallel reads and ConfigReadError cause", async () => {
  async function run(fn: any, refresh: boolean, support: boolean) {
    const trace: any[] = [],
      error = Error("cause");
    const store: any = {
      get: async (key: string) => {
        trace.push(key);
        return key === "a" ? null : undefined;
      },
    };
    if (support)
      store.readSnapshot = async (options: any) => {
        trace.push(options);
        return { all: true };
      };
    try {
      return { trace, value: await fn(store, ["a", "b"], refresh) };
    } catch (e: any) {
      return {
        trace,
        name: e.name,
        message: e.message,
        source: e.source,
        cause: e.cause?.message,
      };
    }
  }
  for (const refresh of [false, true])
    for (const support of [false, true])
      assert.deepEqual(
        await run(readable.readPermissionSnapshot, refresh, support),
        await run(original.wg, refresh, support),
      );
});
test("resource modes and prompt scopes match exact original key and metadata precedence", () => {
  for (const kind of ["origin", "fileTransfer", "fullCdp", "unknown"])
    for (const transferKind of ["download", "upload", "other"]) {
      const r = { kind, transferKind, origin: "https://a" };
      assert.equal(readable.permissionTableKey(r), original.yS(r));
      assert.equal(readable.approvalModeKey(r), original.PL(r));
      assert.equal(
        readable.approvalMode({ approval_mode: "never_ask" }, r),
        original.rie({ approval_mode: "never_ask" }, r),
      );
      assert.equal(readable.defaultsToConversation(r), original.wL(r));
    }
  for (const result of [
    {},
    { _meta: { persist: "session" }, content: { persist: "always" } },
    {
      _meta: [],
      content: {
        persist: "always",
        browser_use_persistent_approval_scope: "all-sites",
      },
    },
    { _meta: { approvals_reviewer: "guardian" } },
  ]) {
    assert.equal(readable.promptPersistence(result), original.RL(result));
    assert.equal(readable.promptApprovesAllSites(result), original.iie(result));
    assert.equal(readable.isUserReviewed(result as any), original.EL(result));
  }
  for (const session of [
    "",
    "a",
    "a-b_c",
    "a.b",
    "a".repeat(128),
    "a".repeat(129),
  ])
    assert.equal(
      readable.validPreferenceSession(session),
      original.wS(session),
    );
});

import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source.ts";
import {
  codexTurnMetadata,
  preferenceSessionId,
  guardianV2Required,
  guardianThreadId,
  preferenceTurn,
} from "../packages/browser/dist/service/preferences/request_context.js";
import { createPreferenceTurnCaches } from "../packages/browser/dist/service/preferences/turn_caches.js";
const metadata = originalServiceBindings([
  "Me",
  "xt",
  "Vc",
  "eie",
  "tie",
  "Gt",
  "zc",
  "lie",
  "cie",
]);
test("preference metadata preserves nested precedence, subagent sessions and fallback alias asymmetry", () => {
  for (const nested of [
    undefined,
    "{bad",
    "[]",
    "null",
    {},
    { session_id: "s", turn_id: "t" },
    { session_id: "", turn_id: "" },
    {
      session_id: "parent",
      thread_id: "child",
      thread_source: "subagent",
      turn_id: "t",
    },
    { session_id: "parent", parent_thread_id: "p" },
    { session_id: "s", thread_source: "agent" },
    { node_repl_auto_review_required: false },
    { node_repl_auto_review_required: "true" },
  ]) {
    for (const meta of [
      {},
      {
        conversationId: "camel",
        turnId: "camelTurn",
        nodeReplAutoReviewRequired: true,
      },
      {
        conversation_id: "conversation",
        thread_id: "thread",
        session_id: "session",
        turn_id: "turn",
        threadSource: "user",
      },
      { threadId: " thread ", parentThreadId: "parent", sessionId: "session" },
    ]) {
      for (const serialized of [false, true]) {
        const runtime = {
          requestMeta: {
            ...meta,
            "x-codex-turn-metadata":
              serialized && typeof nested === "object"
                ? JSON.stringify(nested)
                : nested,
          },
        };
        assert.deepEqual(codexTurnMetadata(runtime), metadata.Me(runtime));
        assert.equal(preferenceSessionId(runtime), metadata.Vc(runtime));
        assert.equal(guardianV2Required(runtime), metadata.eie(runtime));
        assert.equal(guardianThreadId(runtime), metadata.tie(runtime));
        assert.deepEqual(preferenceTurn(runtime), metadata.zc(runtime));
      }
    }
  }
});
function originalCaches() {
  const source = originalServiceBindings(
    ["wS", "Joe", "Zoe", "sie", "aie", "uie"],
    { Sg: new Map(), Yc: new Map() },
  );
  return {
    hasTurnApproval: source.Joe,
    recordTurnApproval: source.Zoe,
    invalidateGuardianApproval: source.sie,
    hasGuardianApproval: source.aie,
    recordGuardianApproval: source.uie,
  };
}
function request(origin = "https://a", turnId = "t", sessionId = "s") {
  return {
    resource: { kind: "origin", origin },
    turn: { sessionId, turnId },
    preferenceSessionId: sessionId,
    guardianMode: "v1",
  };
}
test("turn approvals keep multiple origins, reject invalid sessions and delete stale turns only at original boundaries", () => {
  function run(cache: any) {
    const result: boolean[] = [],
      a = request();
    cache.recordTurnApproval(a.resource.origin, a.turn);
    cache.recordTurnApproval("https://b", a.turn);
    result.push(
      cache.hasTurnApproval(a),
      cache.hasTurnApproval(request("https://b")),
    );
    result.push(cache.hasTurnApproval({ ...a, preferenceSessionId: "other" }));
    result.push(cache.hasTurnApproval(a));
    result.push(cache.hasTurnApproval(request("https://a", "new")));
    result.push(cache.hasTurnApproval(a));
    for (const session of ["", "bad.session", "s".repeat(129)]) {
      const invalid = request("https://a", "t", session);
      cache.recordTurnApproval(invalid.resource.origin, invalid.turn);
      result.push(cache.hasTurnApproval(invalid));
    }
    cache.recordTurnApproval("https://a", { sessionId: "s", turnId: " " });
    result.push(cache.hasTurnApproval(request("https://a", " ")));
    cache.recordTurnApproval("https://a", { sessionId: "s", turnId: "new" });
    result.push(cache.hasTurnApproval(request("https://a", "new")));
    return result;
  }
  assert.deepEqual(run(createPreferenceTurnCaches()), run(originalCaches()));
});
test("guardian v1 cache retains five-minute expiry and separate check/invalidation semantics", (t) => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  function run(cache: any) {
    now = 1000;
    const result: boolean[] = [],
      a = request();
    cache.recordGuardianApproval(a);
    result.push(
      cache.hasGuardianApproval(a),
      cache.hasGuardianApproval(request("https://b")),
      cache.hasGuardianApproval(a),
    );
    cache.invalidateGuardianApproval({
      ...request("https://b"),
      guardianMode: "v2",
    });
    result.push(cache.hasGuardianApproval(a));
    cache.invalidateGuardianApproval(request("https://b"));
    result.push(cache.hasGuardianApproval(a));
    cache.recordGuardianApproval(a);
    now = 300999;
    result.push(cache.hasGuardianApproval(a));
    now = 301000;
    result.push(cache.hasGuardianApproval(a));
    now = 1000;
    result.push(cache.hasGuardianApproval(a));
    const invalidSession = request("https://a", "t", "bad.session");
    cache.recordGuardianApproval({ ...invalidSession, guardianMode: "v2" });
    result.push(cache.hasGuardianApproval(invalidSession));
    cache.invalidateGuardianApproval({
      ...invalidSession,
      resource: { ...invalidSession.resource, kind: "fileTransfer" },
    });
    result.push(cache.hasGuardianApproval(invalidSession));
    return result;
  }
  assert.deepEqual(run(createPreferenceTurnCaches()), run(originalCaches()));
});

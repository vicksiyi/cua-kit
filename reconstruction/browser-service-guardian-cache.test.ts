import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source.ts";
import { createGuardianOriginCache } from "../packages/browser/dist/service/preferences/guardian_cache.js";
function originalCache() {
  return originalServiceBindings(["fr", "BB", "R_", "DB", "RX"], {
    Nn: new Map(),
    ya: undefined,
  }).fr;
}
const origin = { threadId: "thread", origin: "https://example.com" };
test("guardian reviews share pending promise and retry when approval identity changes", async () => {
  async function run(create: () => any) {
    const cache = create(),
      trace: any[] = [];
    try {
      const gate = Promise.withResolvers<string>();
      let calls = 0;
      const first = cache.start(origin, undefined, async (state: any) => {
        calls++;
        const result = await gate.promise;
        cache.record(origin, state);
        return result;
      });
      const second = cache.start(origin, undefined, () => {
        throw Error("must share");
      });
      trace.push([
        first.kind,
        first.shared,
        second.shared,
        first.decision === second.decision,
        calls,
      ]);
      await Promise.resolve();
      trace.push(calls);
      gate.resolve("accepted");
      const result = await first.decision;
      trace.push([result.result, result.approval === cache.get(origin)]);
      trace.push(cache.start(origin, undefined, () => {}).kind);
      const approval = cache.get(origin);
      const next = cache.start(origin, approval, () => "reviewed");
      trace.push([next.kind, next.shared, (await next.decision).result]);
      return trace;
    } finally {
      cache.clear();
    }
  }
  assert.deepEqual(
    await run(createGuardianOriginCache),
    await run(originalCache),
  );
});
test("guardian revocation invalidates in-flight review without letting its completion erase a replacement", async () => {
  async function run(create: () => any) {
    const cache = create(),
      trace: any[] = [];
    try {
      let oldReview: any;
      const gate = Promise.withResolvers<void>();
      const old = cache.start(origin, undefined, async (state: any) => {
        oldReview = state;
        await gate.promise;
        cache.record(origin, state);
        return "old";
      });
      await Promise.resolve();
      cache.revoke(origin);
      trace.push(oldReview.revoked);
      const replacementGate = Promise.withResolvers<void>();
      const replacement = cache.start(origin, undefined, async (state: any) => {
        await replacementGate.promise;
        cache.record(origin, state);
        return "new";
      });
      gate.resolve();
      const result = await old.decision;
      trace.push([result.result, result.approval, cache.get(origin)]);
      const shared = cache.start(origin, undefined, () => {});
      trace.push(shared.decision === replacement.decision);
      replacementGate.resolve();
      const next = await replacement.decision;
      trace.push([next.result, next.approval === cache.get(origin)]);
      cache.revoke(origin);
      trace.push(cache.get(origin));
      const rejected = cache.start(origin, undefined, () => {
        throw Error("review failed");
      });
      await assert.rejects(rejected.decision, /review failed/);
      const retried = cache.start(origin, undefined, () => "retry");
      trace.push([retried.shared, (await retried.decision).result]);
      return trace;
    } finally {
      cache.clear();
    }
  }
  assert.deepEqual(
    await run(createGuardianOriginCache),
    await run(originalCache),
  );
});
test("guardian expiry sweep retains scheduling, unref and exact five-minute boundary", (t) => {
  let now = 1000,
    callback: (() => void) | undefined,
    trace: any[] = [];
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "setTimeout", (fn: () => void, delay: number) => {
    callback = fn;
    trace.push(["timer", delay]);
    return {
      unref() {
        trace.push("unref");
      },
    } as any;
  });
  t.mock.method(globalThis, "clearTimeout", () => {
    trace.push("clear");
  });
  function run(create: () => any) {
    now = 1000;
    trace = [];
    callback = undefined;
    const cache = create();
    cache.record(origin);
    cache.record({ ...origin, origin: "https://second" });
    const approval = cache.get(origin);
    trace.push(approval.expiresAt);
    now = 300999;
    trace.push(cache.get(origin) === approval);
    now = 301000;
    trace.push(cache.get(origin));
    callback!();
    cache.record(origin);
    trace.push(cache.get(origin).expiresAt);
    cache.clear();
    trace.push(cache.get(origin));
    return trace;
  }
  assert.deepEqual(run(createGuardianOriginCache), run(originalCache));
});

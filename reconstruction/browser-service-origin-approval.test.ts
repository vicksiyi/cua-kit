import test from "node:test";
import assert from "node:assert/strict";
import { serviceExpression } from "./service-source";
import {
  createOriginApproval,
  assertOriginPolicy,
} from "../packages/browser/src/service/security/origin_approval";
import { createApprovalRuntime } from "../packages/browser/src/service/security/approval";
import { createGuardianOriginCache } from "../packages/browser/src/service/preferences/guardian_cache";
const names = [
  "NB",
  "FB",
  "HB",
  "kX",
  "MB",
  "BX",
  "gf",
  "OB",
  "PB",
  "tr",
  "ho",
  "hf",
  "sn",
  "Tr",
  "ba",
  "ga",
  "go",
  "nt",
  "PX",
  "Oe",
  "St",
  "j8",
  "JT",
  "el",
  "F8",
  "U8",
  "L8",
  "q8",
  "ze",
  "qB",
  "UB",
  "fr",
  "BB",
  "R_",
  "DB",
  "RX",
];
function original() {
  return new Function(
    "let AB=new WeakMap(),CB,Nn=new Map(),ya;" +
      names
        .map((name) => `const ${name}=${serviceExpression(name)};`)
        .join("\n") +
      "return {prepare:FB,guardian:fr,policy:NB};",
  )();
}
function readable() {
  const guardian = createGuardianOriginCache();
  return {
    ...createOriginApproval(createApprovalRuntime(), guardian),
    guardian,
    policy: assertOriginPolicy,
  };
}
function view(error: any): any {
  return error == null
    ? error
    : {
        name: error.name,
        message: error.message,
        gate: error.gate,
        reason: error.reason,
        context: error.context,
        cause: view(error.cause),
      };
}
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error: view(error) };
  }
}
async function scenario(
  factory: () => any,
  mode: string,
  kind: string,
  bypass = false,
) {
  const api = factory(),
    trace: any[] = [],
    origin = "https://site.test",
    key = { threadId: "thread", origin },
    context = { guardianMode: mode, guardianOrigin: key };
  let asked = 0,
    handled = 0,
    reads = 0;
  const preferences: any = {
    captureOriginRequestContext: (url: string) => {
      trace.push(["capture", url]);
      return context;
    },
    getOriginPermission: async (url: string, ctx: any) => {
      assert.equal(ctx, context);
      trace.push(["permission", ++reads]);
      if (reads > 15) throw new Error("unbounded retry");
      if (kind === "deny" || (kind === "late-deny" && handled > 0))
        return { decision: "deny", source: "codex-network-policy" };
      if (kind === "saved")
        return { decision: "approve", source: "global", scope: "persistent" };
      if (api.guardian.get(key))
        return { decision: "approve", source: "guardian-origin-cache" };
    },
    isAutoReviewDisabled: async () => {
      trace.push("auto-review");
      return kind === "disabled" || (kind === "disable-after" && handled > 0);
    },
    isOriginAutoReviewDisabled: async (url: string) => {
      trace.push(["origin-auto", url]);
      return false;
    },
    isPersistentApprovalAllowed: async (url: string) => {
      trace.push(["persistent", url]);
      return true;
    },
    handleOriginPromptResult: async (
      url: string,
      result: any,
      ctx: any,
      options: any,
    ) => {
      trace.push([
        "handle",
        url,
        result,
        options.guardianReview?.revoked,
        options.guardianReviewRequested,
      ]);
      handled++;
      if (
        result.action === "accept" &&
        result._meta &&
        mode === "v2" &&
        options.guardianReviewRequested
      ) {
        if (kind === "revoked" && handled === 1) api.guardian.revoke(key);
        api.guardian.record(key, options.guardianReview);
      }
    },
    isOriginBlockedByPolicy: async (url: string, permission: string) => {
      trace.push(["policy", url, permission]);
      return kind === "deny";
    },
  };
  const getter = () => {
    trace.push("factory");
    return async (request: any) => {
      trace.push(["request", request]);
      asked++;
      return {
        action:
          kind === "cancel"
            ? "cancel"
            : kind === "decline" || asked > 1
              ? "decline"
              : "accept",
        ...(kind === "user" || kind === "disabled"
          ? {}
          : { _meta: { approvals_reviewer: "auto_review" } }),
      };
    };
  };
  try {
    const policy = await outcome(() => api.policy(origin, preferences));
    const result = await outcome(async () => {
      const approve = await api.prepare(
        getter,
        origin,
        preferences,
        { elicitationDisplayName: "Test" },
        undefined,
        bypass,
      );
      trace.push("prepared");
      return approve();
    });
    return { policy, result, trace, asked };
  } finally {
    api.guardian.clear();
  }
}
test("origin approval matches v1/v2, saved decisions, bypass, post-review denial, revocation and disabled-review rechecks", async () => {
  for (const mode of ["v1", "v2"])
    for (const kind of [
      "saved",
      "deny",
      "user",
      "guardian",
      "cancel",
      "decline",
      "disabled",
      "late-deny",
      "revoked",
      "disable-after",
    ])
      for (const bypass of [false, true])
        assert.deepEqual(
          await scenario(readable, mode, kind, bypass),
          await scenario(original, mode, kind, bypass),
        );
});

async function concurrent(
  factory: () => any,
  reviewer: boolean,
  action: string,
) {
  const api = factory(),
    trace: any[] = [],
    key = { threadId: "thread", origin: "https://site.test" },
    context = { guardianMode: "v2", guardianOrigin: key };
  const started = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>();
  let calls = 0,
    reads = 0;
  const preferences: any = {
    captureOriginRequestContext: () => context,
    getOriginPermission: async () => {
      if (++reads > 20) throw new Error("unbounded retry");
      return api.guardian.get(key)
        ? { decision: "approve", source: "guardian-origin-cache" }
        : undefined;
    },
    isAutoReviewDisabled: async () => false,
    isOriginAutoReviewDisabled: async () => false,
    isPersistentApprovalAllowed: async () => false,
    handleOriginPromptResult: async (
      _url: any,
      result: any,
      _ctx: any,
      options: any,
    ) => {
      trace.push(["handle", result.action]);
      if (reviewer && result.action === "accept")
        api.guardian.record(key, options.guardianReview);
    },
  };
  const timing = {
    trackElicitation: (fn: any) => {
      trace.push("track-shared");
      return fn;
    },
  };
  const getter = () => async (request: any) => {
    trace.push(["ask", ++calls, request.meta]);
    started.resolve();
    await release.promise;
    return {
      action,
      ...(reviewer ? { _meta: { approvals_reviewer: "auto_review" } } : {}),
    };
  };
  try {
    const a = await api.prepare(getter, key.origin, preferences, {}, timing),
      b = await api.prepare(getter, key.origin, preferences, {}, timing);
    const first = outcome(a),
      second = outcome(b);
    await started.promise;
    await new Promise((resolve) => setImmediate(resolve));
    release.resolve();
    return { results: await Promise.all([first, second]), trace, calls };
  } finally {
    api.guardian.clear();
  }
}
test("concurrent origin requests share guardian/cancel results but repeat independent user decisions", async () => {
  for (const reviewer of [true, false])
    for (const action of ["accept", "decline", "cancel"])
      assert.deepEqual(
        await concurrent(readable, reviewer, action),
        await concurrent(original, reviewer, action),
      );
});

async function cacheRace(factory: () => any) {
  const api = factory(),
    key = { threadId: "thread", origin: "https://site.test" },
    context = { guardianMode: "v2", guardianOrigin: key },
    trace: any[] = [];
  let reads = 0;
  api.guardian.record(key);
  const preferences: any = {
    captureOriginRequestContext: () => context,
    getOriginPermission: async () => {
      reads++;
      trace.push(reads);
      if (reads === 2) api.guardian.record(key);
      return { decision: "approve", source: "guardian-origin-cache" };
    },
  };
  try {
    const approve = await api.prepare(
      () => {
        throw new Error("must not prompt");
      },
      key.origin,
      preferences,
    );
    return { result: await approve(), trace };
  } finally {
    api.guardian.clear();
  }
}
test("cached origin approval is retried when its identity changes during the async permission read", async () => {
  assert.deepEqual(await cacheRace(readable), await cacheRace(original));
});

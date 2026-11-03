import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { originalServiceBindings } from "./service-source.ts";
import { createAutoAnswerMethod } from "../packages/browser/dist/service/preferences/auto_answer.js";
const manifest = JSON.parse(
  readFileSync(new URL("./source-map.json", import.meta.url), "utf8"),
);
const names = [
  ...new Set<string>([
    ...[
      "origin_patterns",
      "origin_policy",
      "network_config",
      "persisted_permissions",
    ].flatMap(
      (name) =>
        manifest.modules[`packages/browser/src/service/preferences/${name}.ts`]
          .symbols,
    ),
    "lu",
    "TL",
  ]),
];
const constants = {
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
  bL: "disable_auto_review",
};
const origin = "https://example.com";
async function run(original: boolean, options: any = {}) {
  const trace: any[] = [],
    kind = options.kind ?? "origin",
    key =
      kind === "origin"
        ? "origins"
        : kind === "fullCdp"
          ? "full_cdp"
          : "downloads";
  let guardianReads = 0;
  const guardian: any = {
    get: () => {
      trace.push("guardian.get");
      guardianReads++;
      return options.guardian && !(options.revoke && guardianReads > 1)
        ? {}
        : undefined;
    },
  };
  const turns: any = {
    invalidateGuardianApproval: () => trace.push("invalidate"),
    hasGuardianApproval: () => {
      trace.push("v1");
      return !!options.v1;
    },
    hasTurnApproval: () => {
      trace.push("turn");
      return !!options.turn;
    },
  };
  const source = originalServiceBindings(names, {
    ...constants,
    fr: guardian,
    sie: turns.invalidateGuardianApproval,
    aie: turns.hasGuardianApproval,
    Joe: turns.hasTurnApproval,
  });
  function store(data: any, label: string) {
    return {
      get: async (key: string) => {
        trace.push([label, "get", key]);
        return data[key];
      },
      readSnapshot: async (value: any) => {
        trace.push([label, "snapshot", value]);
        return data;
      },
    };
  }
  const global = {
    [key]: {
      allowed: options.globalAllow ? [origin] : [],
      denied: options.globalDeny ? [origin] : [],
    },
    approval_mode: options.neverAsk ? "never_ask" : "always_ask",
    disable_auto_review: options.snapshotDisabled,
  };
  const session = {
    [key]: {
      allowed: options.sessionAllow ? [origin] : [],
      denied: options.sessionDeny ? [origin] : [],
    },
  };
  const owner: any = {
    config: {
      global: store(global, "global"),
      session: (id: string) => {
        trace.push(["session", id]);
        return store(session, "session");
      },
      readRequirements: async () => {
        trace.push("requirements");
        return {
          requirements: {
            browserUse: {
              defaultOriginPolicy: {
                accessApprovalLifetime: options.lifetime ?? "thread",
              },
            },
          },
        };
      },
      readAll: async () => {
        trace.push("all");
        return { config: {} };
      },
    },
    isPersistentApprovalAllowed: async () => {
      trace.push("persistent");
      if (options.failPolicy) throw Error("policy failed");
      return options.persistent !== false;
    },
    isAutoReviewDisabled: async () => {
      trace.push("autoDisabled");
      return !!options.autoDisabled;
    },
    isOriginAutoReviewDisabled: async () => {
      trace.push("originDisabled");
      return !!options.originDisabled;
    },
    allowsGlobalPersistentApproval: async () => {
      trace.push("globalPersistent");
      return options.globalPersistent !== false;
    },
  };
  const request = {
    resource: { kind, origin, transferKind: "download" },
    preferenceSessionId: options.invalidSession ? "bad.session" : "session",
    guardianMode: options.mode ?? "v2",
    guardianOrigin: { threadId: "thread", origin },
  };
  const method = original
    ? source.lu.prototype.maybeAutoAnswerBrowserUseRequest
    : createAutoAnswerMethod(guardian, turns);
  try {
    return { trace, decision: await method.call(owner, request) };
  } catch (error: any) {
    return { trace, error: error.message };
  }
}
test("auto-answer preserves denial precedence, snapshot refresh and ordered permission fallbacks", async () => {
  const cases = [
    {},
    { globalDeny: true, sessionDeny: true, guardian: true },
    { globalDeny: true, sessionAllow: true, turn: true },
    { sessionDeny: true, globalAllow: true, v1: true },
    { v1: true, turn: true },
    { guardian: true, turn: true },
    { turn: true, globalAllow: true },
    { sessionAllow: true },
    { sessionAllow: true, lifetime: "turn" },
    { globalAllow: true },
    { globalAllow: true, persistent: false },
    { neverAsk: true },
    { neverAsk: true, globalPersistent: false },
    { sessionAllow: true, invalidSession: true },
    { failPolicy: true },
  ];
  for (const options of cases)
    for (const mode of ["v1", "v2"])
      for (const kind of ["origin", "fileTransfer", "fullCdp"])
        assert.deepEqual(
          await run(false, { ...options, mode, kind }),
          await run(true, { ...options, mode, kind }),
        );
});
test("guardian decision rechecks cache after async policy and honors both snapshot and policy disabling", async () => {
  for (const options of [
    { guardian: true },
    { guardian: true, revoke: true },
    { guardian: true, snapshotDisabled: true },
    { guardian: true, autoDisabled: true },
    { guardian: true, originDisabled: true },
    { guardian: true, revoke: true, turn: true },
  ])
    assert.deepEqual(await run(false, options), await run(true, options));
  const revoked = await run(false, { guardian: true, revoke: true });
  assert.equal(revoked.decision, null);
  assert.equal(
    revoked.trace.filter((item) => item === "guardian.get").length,
    2,
  );
});

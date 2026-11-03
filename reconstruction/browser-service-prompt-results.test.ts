import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { originalServiceBindings } from "./service-source.ts";
import { createPromptResultHandler } from "../packages/browser/dist/service/preferences/prompt_results.js";
import { ConfigReadError } from "../packages/browser/dist/service/preferences/persisted_permissions.js";
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
    "gS",
    "Yoe",
    "CL",
    "AL",
    "aL",
    "TL",
    "ga",
    "go",
    "PX",
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
};
const base = {
  resource: { kind: "origin", origin: "https://example.com" },
  preferenceSessionId: "session",
  turn: { sessionId: "session", turnId: "turn" },
  guardianOrigin: { threadId: "thread", origin: "https://example.com" },
  guardianMode: "v2",
};
async function run(
  isOriginal: boolean,
  request: any,
  result: any,
  policy: any = {},
  errorKind = "",
) {
  const trace: any[] = [],
    global: any = {},
    session: any = {};
  const guardian: any = {
    record: (...args: any[]) => trace.push(["record", ...args]),
    revoke: (...args: any[]) => trace.push(["revoke", ...args]),
  };
  const turns: any = {
    recordGuardianApproval: (value: any) => trace.push(["v1", value]),
    recordTurnApproval: (...args: any[]) => trace.push(["turn", ...args]),
  };
  const source = originalServiceBindings(names, {
    ...constants,
    fr: guardian,
    uie: turns.recordGuardianApproval,
    Zoe: turns.recordTurnApproval,
  });
  const ErrorClass = isOriginal ? source.dn : ConfigReadError;
  function store(state: any, label: string) {
    return {
      async set(key: string, value: any) {
        trace.push([label, "set", key, value]);
        if (errorKind)
          throw errorKind === "config"
            ? new ErrorClass("config", Error("cause"))
            : Error("write");
        state[key] = value;
      },
      async update(transform: any) {
        trace.push([label, "update"]);
        if (errorKind)
          throw errorKind === "config"
            ? new ErrorClass("config", Error("cause"))
            : Error("write");
        Object.assign(state, transform(state));
      },
    };
  }
  const config = {
    global: store(global, "global"),
    session: (id: string) => {
      trace.push(["session", id]);
      return store(session, "session");
    },
    readRequirements: async () => {
      trace.push("requirements");
      return { requirements: { browserUse: policy } };
    },
    readAll: async () => {
      trace.push("all");
      return { config: {} };
    },
  };
  const handler = isOriginal
    ? source.gS
    : createPromptResultHandler(guardian, turns).handlePromptResult;
  try {
    await handler(request, result, config);
    return { trace, global, session };
  } catch (error: any) {
    return {
      trace,
      global,
      session,
      error: { name: error.name, message: error.message, source: error.source },
    };
  }
}
test("prompt results preserve user scopes, managed downgrades, turn lifetime and storage error boundary", async () => {
  const cases = [
    { result: { action: "accept" } },
    { result: { action: "accept", _meta: { persist: "always" } } },
    {
      result: {
        action: "accept",
        _meta: {
          persist: "always",
          browser_use_persistent_approval_scope: "all-sites",
        },
      },
    },
    { result: { action: "decline", _meta: { persist: "always" } } },
    { result: { action: "cancel" } },
    { result: { action: "accept", _meta: { approvals_reviewer: "other" } } },
  ];
  for (const { result } of cases)
    for (const policy of [
      {},
      { allowGlobalPersistentApproval: false },
      { defaultOriginPolicy: { persistentApproval: false } },
      { defaultOriginPolicy: { accessApprovalLifetime: "turn" } },
    ])
      for (const kind of ["origin", "fileTransfer", "fullCdp"]) {
        const request = {
          ...base,
          resource: { ...base.resource, kind, transferKind: "download" },
        };
        assert.deepEqual(
          await run(false, request, result, policy),
          await run(true, request, result, policy),
        );
      }
  for (const error of ["config", "ordinary"])
    assert.deepEqual(
      await run(false, base, { action: "accept" }, {}, error),
      await run(true, base, { action: "accept" }, {}, error),
    );
});
test("guardian results preserve revoked/requested flags, timeout exception and v1 routing", async () => {
  const timeout = originalServiceBindings(["PX"]).PX;
  for (const action of ["accept", "decline", "cancel"])
    for (const mode of ["v1", "v2"])
      for (const guardianReviewRequested of [undefined, false])
        for (const revoked of [false, true])
          for (const message of [
            "denied",
            `  ${timeout.replaceAll(" ", "\n")}  `,
          ]) {
            const request = {
              ...base,
              guardianMode: mode,
              guardianReviewRequested,
              guardianReview: { revoked },
            };
            const result = {
              action,
              _meta: { approvals_reviewer: "auto_review", message },
            };
            assert.deepEqual(
              await run(false, request, result),
              await run(true, request, result),
            );
          }
});

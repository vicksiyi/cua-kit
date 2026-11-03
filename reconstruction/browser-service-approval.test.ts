import { createCapabilityApprovals } from "../packages/browser/src/service/security/capability_approvals";
import test from "node:test";
import assert from "node:assert/strict";
import { serviceExpression } from "./service-source";
import {
  createApprovalRuntime,
  savedPermissionApproval,
  approvalDecision,
  safelyGuardianReviewed,
  browserDisplayName,
} from "../packages/browser/src/service/security/approval";
const names = [
  "LB",
  "I_",
  "WB",
  "qe",
  "UB",
  "IX",
  "Es",
  "qB",
  "ze",
  "PB",
  "RB",
  "IB",
  "hf",
  "kB",
  "ho",
  "tr",
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
];
function original() {
  return new Function(
    "let AB=new WeakMap(),CB;" +
      names
        .map((name) => `const ${name}=${serviceExpression(name)};`)
        .join("\n") +
      "return {recordDuration:PB,approvalDuration:RB,setAuditSink:IB,emitAudit:hf,recordSuccess:kB,failCheck:ho,createElicitation:tr,savedPermissionApproval:sn,approvalDecision:Tr,safelyGuardianReviewed:ba,browserDisplayName:nt,history:LB,fileTransfer:I_,fullCdp:WB};",
  )();
}
function view(error: any): any {
  return error == null
    ? error
    : {
        name: error.name,
        message: error.message,
        reason: error.reason,
        gate: error.gate,
        context: error.context,
        cause: view(error.cause),
        ownCause: Object.hasOwn(error, "cause"),
      };
}
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error: view(error) };
  }
}
const audit = {
  gate: "originApproval",
  origin: "https://example.test",
  extra: "preserved",
};
test("saved approval reuse and prompt decisions preserve denial sources, guardian metadata and context", async () => {
  const expected = original();
  for (const permission of [
    undefined,
    null,
    ...["deny", "approve", "unknown"].flatMap((decision) =>
      [
        "codex-network-policy",
        "codex-history-policy",
        "user",
        "guardian-origin-cache",
      ].map((source) => ({ decision, source, scope: "session" })),
    ),
  ])
    assert.deepEqual(
      await outcome(() => savedPermissionApproval(audit, permission)),
      await outcome(() => expected.savedPermissionApproval(audit, permission)),
    );
  const timeout =
    "The automatic permission approval review did not finish before its deadline. Do not assume the action is unsafe based on the timeout alone. You may retry once, or ask the user for guidance or explicit approval.";
  for (const action of ["accept", "decline", "cancel", "unknown"])
    for (const reviewer of [
      undefined,
      "auto_review",
      "guardian_subagent",
      "user",
    ])
      for (const message of [
        undefined,
        "",
        "Review says no",
        timeout.replaceAll(" ", " \n"),
      ]) {
        const result = {
          action,
          _meta: { approvals_reviewer: reviewer, message },
        };
        for (const source of [undefined, "guardian-auto-review"])
          assert.deepEqual(
            await outcome(() => approvalDecision(audit, result, source)),
            await outcome(() =>
              expected.approvalDecision(audit, result, source),
            ),
          );
      }
  const broken = {
    action: "decline",
    get _meta() {
      throw new Error("metadata failed");
    },
  };
  assert.equal(
    safelyGuardianReviewed(broken),
    expected.safelyGuardianReviewed(broken),
  );
  assert.deepEqual(
    await outcome(() => approvalDecision(audit, broken)),
    await outcome(() => expected.approvalDecision(audit, broken)),
  );
  for (const options of [
    undefined,
    {},
    { elicitationDisplayName: "" },
    { elicitationDisplayName: "Chrome" },
  ])
    assert.equal(
      browserDisplayName(options),
      expected.browserDisplayName(options),
    );
});

async function requests(factory: () => any) {
  const runtime = factory(),
    trace: any[] = [];
  const contexts = [
    audit,
    {
      audit: { origin: "https://example.test" },
      check: "check",
      options: { browserBackend: "extension" },
      errorMessage: "cannot ask",
    },
  ];
  runtime.setAuditSink((record: any) => trace.push(["audit", record]));
  for (const context of contexts) {
    for (const mode of [
      "missing",
      "factory-error",
      "reject",
      "primitive",
      "null",
      "invalid",
      "accept",
      "decline",
      "cancel",
      "action-getter",
    ]) {
      let response: any =
        mode === "primitive"
          ? 3
          : mode === "null"
            ? null
            : mode === "action-getter"
              ? {
                  get action() {
                    throw new Error("action getter");
                  },
                }
              : { action: mode };
      const result = await outcome(async () => {
        const invoke = runtime.createElicitation(() => {
          trace.push(["factory", mode]);
          if (mode === "missing") return undefined;
          if (mode === "factory-error") throw new Error("factory failed");
          return async (request: any) => {
            trace.push(["invoke", request]);
            if (mode === "reject") throw new Error("request failed");
            return response;
          };
        }, context);
        const value = await invoke({ message: "ask" });
        assert.equal(value, response);
        return value;
      });
      const duration = runtime.approvalDuration(response);
      trace.push([
        mode,
        result,
        typeof duration === "number" &&
          Number.isInteger(duration) &&
          duration >= 0,
      ]);
    }
  }
  return trace;
}
test("elicitation wrapper preserves factory and callback failures, invalid results, duration placement and result identity", async () => {
  assert.deepEqual(
    await requests(createApprovalRuntime),
    await requests(original),
  );
});

async function audits(factory: () => any) {
  const runtime = factory(),
    trace: any[] = [],
    result = { action: "accept" };
  runtime.emitAudit(() => {
    throw new Error("must not build without sink");
  });
  runtime.recordDuration(result, 17);
  trace.push(
    runtime.approvalDuration(result),
    runtime.approvalDuration({ action: "accept" }),
  );
  runtime.setAuditSink((record: any) => {
    trace.push(record);
    return Promise.reject(new Error("ignored sink failure"));
  });
  runtime.recordSuccess(
    "origin",
    { browserBackend: "iab", browserFamily: "chrome" },
    "stored",
    { source: "policy" },
    4,
  );
  for (const reason of ["approval_unavailable", "user_declined"])
    trace.push(
      await outcome(() =>
        runtime.failCheck(
          {
            check: "origin",
            reason,
            audit: { origin: "https://example.test" },
            options: { browserBackend: "iab" },
            durationMs: 9,
            permissionSource: "review",
          },
          "detail",
          new Error("cause"),
        ),
      ),
    );
  runtime.setAuditSink(() => {
    throw new Error("sync sink failure");
  });
  runtime.recordSuccess("ignored");
  trace.push(
    await outcome(() =>
      runtime.failCheck(
        { check: "origin", reason: "approval_failed_closed" },
        "detail",
      ),
    ),
  );
  runtime.setAuditSink(undefined);
  runtime.emitAudit(() => {
    trace.push("unexpected");
    return {};
  });
  await new Promise((resolve) => setImmediate(resolve));
  return trace;
}
test("approval audit keeps weak identity, failure classification and ignored synchronous/asynchronous sinks", async () => {
  assert.deepEqual(await audits(createApprovalRuntime), await audits(original));
});

async function capabilityScenario(
  useOriginal: boolean,
  kind: string,
  permission: any,
  action: string,
  persistent: boolean,
  url: string,
  bypass = false,
) {
  const runtime = useOriginal ? original() : createApprovalRuntime();
  const capabilities = useOriginal
    ? runtime
    : createCapabilityApprovals(runtime);
  const trace: any[] = [];
  const preferences = Object.fromEntries(
    [
      "getHistoryPermission",
      "getFileTransferPermission",
      "getFullCdpPermission",
      "allowsGlobalPersistentApproval",
      "isPersistentApprovalAllowed",
      "handleHistoryPromptResult",
      "handleFileTransferPromptResult",
      "handleFullCdpPromptResult",
    ].map((method) => [
      method,
      async (...args: any[]) => {
        trace.push([method, args]);
        return method.startsWith("get")
          ? permission
          : method.startsWith("handle")
            ? undefined
            : persistent;
      },
    ]),
  );
  const getElicitation = () => {
    trace.push("factory");
    return async (request: any) => {
      trace.push(["ask", request]);
      return { action };
    };
  };
  const localize = (message: any, values: any) => {
    trace.push(["localize", message, values]);
    return message.defaultMessage.replace("{url}", values.url);
  };
  const result = await outcome(async () => {
    const approve =
      kind === "history"
        ? await capabilities.history(
            getElicitation,
            { query: "recent" },
            "extension",
            preferences,
            { elicitationDisplayName: "Chrome" },
            bypass,
          )
        : kind === "fullCdp"
          ? await capabilities.fullCdp(getElicitation, url, preferences)
          : await capabilities.fileTransfer(
              getElicitation,
              kind,
              url,
              preferences,
              localize,
            );
    trace.push("prepared");
    return await approve();
  });
  return { result, trace };
}
test("history, file-transfer and full-CDP preparations match permission reuse, metadata, persistence and prompt ordering", async () => {
  for (const kind of ["history", "download", "upload", "fullCdp"])
    for (const permission of [
      undefined,
      { decision: "approve", source: "global", scope: "persistent" },
      { decision: "deny", source: "codex-network-policy" },
    ])
      for (const action of ["accept", "decline", "cancel"])
        for (const persistent of [false, true]) {
          assert.deepEqual(
            await capabilityScenario(
              false,
              kind,
              permission,
              action,
              persistent,
              "https://user:pass@site.test/path?q=1",
            ),
            await capabilityScenario(
              true,
              kind,
              permission,
              action,
              persistent,
              "https://user:pass@site.test/path?q=1",
            ),
          );
        }
  for (const kind of ["download", "upload", "fullCdp"])
    for (const url of [
      "invalid",
      "file:///tmp/page?q#hash",
      "codex-sandbox://web-sandbox.oaiusercontent.com/app",
    ])
      assert.deepEqual(
        await capabilityScenario(false, kind, undefined, "accept", false, url),
        await capabilityScenario(true, kind, undefined, "accept", false, url),
      );
  for (const permission of [
    undefined,
    { decision: "deny", source: "global" },
    { decision: "approve", source: "session" },
  ])
    assert.deepEqual(
      await capabilityScenario(
        false,
        "history",
        permission,
        "accept",
        true,
        "",
        true,
      ),
      await capabilityScenario(
        true,
        "history",
        permission,
        "accept",
        true,
        "",
        true,
      ),
    );
});

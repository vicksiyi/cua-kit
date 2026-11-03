import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings, serviceExpression } from "./service-source";
import {
  createAutomatedReviewHostRegistry,
  createAutomatedAuthPrecheck,
} from "../packages/browser/src/service/browser_auth/automated_review";
import {
  approvalRuntime,
  browserDisplayName,
} from "../packages/browser/src/service/security/approval";
import {
  isGuardianReviewed,
  guardianReviewTimedOut,
} from "../packages/browser/src/service/preferences/prompt_results";
import { securityMode } from "../packages/browser/src/service/security/gate_policy";
import { failAuthSafetyReview } from "../packages/browser/src/service/browser_auth/safety_review";
test("automated review registry matches original ownership, env identity and disposal", () => {
  const original = new Function(
    "Qt",
    `let As; const ii="BROWSER_USE_SECURITY_MODE",cl="BROWSER_USE_AUTOMATED_SAFETY_PRECHECKS_ENABLED";const zr=(runtime,key)=>runtime.env[key]==="1";${["Uy", "ci", "bp", "qy"].map((n) => `const ${n}=(${serviceExpression(n)});`).join("\n")}return {register:Uy,current:ci,matches:bp,enabled:qy};`,
  )(securityMode);
  function run(registry: any) {
    const env = {
      BROWSER_USE_SECURITY_MODE: " gaas-browser-environment ",
      BROWSER_USE_AUTOMATED_SAFETY_PRECHECKS_ENABLED: "1",
    };
    const runtime = { env, createElicitation() {} };
    const results = [registry.enabled(runtime)];
    const dispose = registry.register(runtime);
    const duplicate = registry.register({ env: {} });
    results.push(
      Object.isFrozen(registry.current()),
      registry.matches(runtime),
      registry.matches({ ...runtime, env: { ...env } }),
    );
    env.BROWSER_USE_AUTOMATED_SAFETY_PRECHECKS_ENABLED = "0";
    results.push(registry.enabled(runtime), registry.matches(runtime));
    duplicate();
    results.push(registry.current() != null);
    dispose();
    results.push(registry.current(), registry.enabled(runtime));
    const dispose2 = registry.register(runtime);
    dispose();
    results.push(registry.current() != null);
    dispose2();
    return results;
  }
  assert.deepEqual(run(createAutomatedReviewHostRegistry()), run(original));
});
test("automated auth precheck matches original strict approval, failures and audit", async (t) => {
  t.mock.method(performance, "now", () => 100);
  async function run(source: boolean, mode: string) {
    const trace: any[] = [];
    const hosts = createAutomatedReviewHostRegistry();
    const runtime: any = {
      env: {
        BROWSER_USE_SECURITY_MODE: "gaas-browser-environment",
        BROWSER_USE_AUTOMATED_SAFETY_PRECHECKS_ENABLED:
          mode === "disabled" ? "0" : "1",
      },
      async createElicitation(request: any) {
        trace.push(["request", request]);
        if (mode === "reject") throw new Error("host failure");
        return {
          action:
            mode === "invalid"
              ? "unknown"
              : mode.includes("decline")
                ? "decline"
                : mode.includes("cancel")
                  ? "cancel"
                  : "accept",
          _meta: {
            approvals_reviewer: mode.includes("unreviewed")
              ? undefined
              : mode.includes("user")
                ? "user"
                : "guardian_subagent",
            ...(mode === "decline-message"
              ? { message: " custom denial " }
              : {}),
          },
        };
      },
    };
    if (mode === "missing-host") delete runtime.createElicitation;
    if (
      mode === "registered" ||
      mode === "mutated" ||
      mode === "different-env"
    ) {
      hosts.register(runtime);
      if (mode === "different-env") runtime.env = { ...runtime.env };
    }
    const timing = {
      trackElicitation(fn: any) {
        trace.push("track");
        return fn;
      },
    };
    const original = originalServiceBindings(["QB", "eD"], {
      qy: hosts.enabled,
      ci: hosts.current,
      bp: hosts.matches,
      nt: browserDisplayName,
      tr: approvalRuntime.createElicitation,
      _a: failAuthSafetyReview,
      RB: approvalRuntime.approvalDuration,
      ga: isGuardianReviewed,
      go: guardianReviewTimedOut,
      kB: approvalRuntime.recordSuccess,
    });
    let result: any;
    approvalRuntime.setAuditSink((audit) => trace.push(["audit", audit]));
    try {
      const precheck = source
        ? original.eD(runtime, timing, { elicitationDisplayName: "Fixture" })
        : createAutomatedAuthPrecheck(
            runtime,
            timing,
            { elicitationDisplayName: "Fixture" },
            hosts,
          );
      if (mode === "mutated")
        runtime.env.BROWSER_USE_AUTOMATED_SAFETY_PRECHECKS_ENABLED = "0";
      result =
        precheck == null
          ? "disabled"
          : await precheck({
              message: "synthetic review",
              toolName: mode === "blank-tool" ? " " : " action ",
              toolParams: { fixture: true },
            });
    } catch (error) {
      const e = error as any;
      result = {
        name: e.name,
        message: e.message,
        reason: e.reason,
        cause: e.cause?.message,
      };
    } finally {
      approvalRuntime.setAuditSink(undefined);
    }
    return { result, trace };
  }
  for (const mode of [
    "normal",
    "registered",
    "mutated",
    "different-env",
    "disabled",
    "missing-host",
    "reject",
    "invalid",
    "accept-unreviewed",
    "accept-user",
    "decline",
    "decline-unreviewed",
    "decline-user",
    "decline-message",
    "cancel",
    "cancel-user",
    "blank-tool",
  ])
    assert.deepEqual(await run(false, mode), await run(true, mode), mode);
  assert.equal((await run(false, "normal")).result.action, "accept");
  assert.equal(
    (await run(false, "accept-user")).result.reason,
    "approval_failed_closed",
  );
  assert.equal(
    (await run(false, "mutated")).trace.filter(
      (entry: any) => entry[0] === "request",
    ).length,
    0,
  );
});

test("auth screenshot uses restored device capture and preserves original unavailable boundary", async () => {
  const { captureAuthScreenshot } =
    await import("../packages/browser/src/service/browser_auth/screenshot");
  const { captureTabScreenshot } =
    await import("../packages/browser/src/service/commands/screenshot");
  const original = originalServiceBindings(["ZM"], {
    Ui: captureTabScreenshot,
    an: "jpeg",
  }).ZM;
  async function run(source: boolean, fail: boolean) {
    const trace: any[] = [];
    const context: any = {
      browserId: "fixture",
      credentialObservationGate: {
        async observe(callback: Function, tab: number) {
          trace.push(["observe", tab]);
          return callback();
        },
      },
      cdp: {
        async withInternalScreencast() {
          trace.push("screencast");
          return undefined;
        },
        async call(tab: number, method: string, params: any) {
          trace.push([tab, method, params]);
          if (fail) throw new Error("capture failure");
          return method === "Page.getLayoutMetrics"
            ? {
                cssVisualViewport: {
                  pageX: 0,
                  pageY: 0,
                  clientWidth: 100,
                  clientHeight: 80,
                },
              }
            : { data: "synthetic-base64" };
        },
      },
    };
    return {
      result: await (source ? original : captureAuthScreenshot)(
        { tab_id: "7", origin: "https://fixture.test" },
        context,
      ),
      trace,
    };
  }
  for (const fail of [false, true])
    assert.deepEqual(await run(false, fail), await run(true, fail));
  assert.equal(
    (await run(false, false)).result.url,
    "data:image/jpeg;base64,synthetic-base64",
  );
  assert.equal((await run(false, true)).result, undefined);
});

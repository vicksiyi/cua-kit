import assert from "node:assert/strict";
import test from "node:test";
import { createCommandScheduling } from "../packages/browser/src/service/runtime/command_scheduler";
import {
  createCredentialObservationState,
  CredentialObservationError,
} from "../packages/browser/src/service/security/credential_observation";
import { BrowserUseSecurityError } from "../packages/browser/src/service/errors/browser_security_error";
import { BrowserCredentialRecoveryError } from "../packages/browser/src/service/errors/credential_recovery_error";
import {
  GetBrowserCommand,
  ListBrowsersCommand,
} from "../packages/browser/src/commands/browser_inventory";
import { serviceExpression } from "./service-source";
function original(state: any) {
  const ext: any = {
    A_: () => state.isUnavailable(),
    Mn: () => state.allGates(),
    ac: () => {
      if (state.isUnavailable())
        throw new CredentialObservationError("credential_state_unavailable");
    },
    P_: () => state.beginObservation(),
    Fi: () => state.ensureResumed(),
    Tt: CredentialObservationError,
    St: BrowserUseSecurityError,
    xs: BrowserCredentialRecoveryError,
    oe: { GetBrowser: GetBrowserCommand, ListBrowsers: ListBrowsersCommand },
  };
  return new Function(
    ...Object.keys(ext),
    `let B3=Promise.resolve();${["O3", "M3", "N3", "F3", "L3", "U3", "bue"].map((n) => `const ${n}=${serviceExpression(n)};`).join("")} ${["Je", "$o", "D3", "q3"].map(serviceExpression).join("\n")}return {createCommandScheduler:q3,guardState:D3,canObserve:Je,shouldEmitResponseMetadata:$o};`,
  )(...Object.values(ext));
}
function fixture(factory: any, options: any = {}) {
  const trace: any[] = [];
  let executions = 0,
    checks = 0,
    resumes = 0;
  let unavailable = !!options.unavailable;
  const gate: any = {
    browserId: "resolved",
    observationEpoch: 1,
    usedNativeCredentials: !!options.protected,
    protectionPending: !!options.pending,
    invalidateDocuments(id: any) {
      trace.push(["invalidate", id]);
      this.observationEpoch++;
    },
    assertRetainedObservationAllowed() {
      trace.push(["retained"]);
      if (this.usedNativeCredentials)
        throw new CredentialObservationError("retained_data_restricted");
    },
    async assertObservationAllowed(tab: any, epoch: any, enforce: any) {
      trace.push(["check", Number.isNaN(tab) ? "NaN" : tab, epoch, enforce]);
      checks++;
      if (options.checkError === checks)
        throw new CredentialObservationError(
          options.reason ?? "credential_observation_restricted",
        );
    },
  };
  const state: any = {
    isUnavailable: () => unavailable,
    allGates: () => [gate],
    beginObservation() {
      trace.push(["begin"]);
      if (options.pending)
        throw new CredentialObservationError("credential_delivery_in_progress");
      return () => trace.push(["finish"]);
    },
    async ensureResumed() {
      trace.push(["resume"]);
      resumes++;
      if (options.resumeError === resumes) {
        unavailable = true;
        throw new CredentialObservationError("credential_state_unavailable");
      }
    },
  };
  const scheduler = factory(state);
  const execute = async (cmd: any, finish: any) => {
    trace.push(["execute", cmd, typeof finish]);
    executions++;
    if (options.changeEpoch) gate.observationEpoch++;
    if (options.protectDuring) gate.usedNativeCredentials = true;
    if (options.releaseEarly) finish?.();
    if (options.error) throw options.error;
    if (options.run) await options.run();
    return (
      options.result ?? {
        id: "12",
        name: "Synthetic",
        type: "extension",
        capabilities: {},
        extra: "stripped only when restricted",
      }
    );
  };
  const resolve = async (id: any) => {
    trace.push(["resolve", id]);
    if (options.resolveError) throw Error("resolve failed");
    return "resolved";
  };
  const report = (detail: any) => {
    trace.push(["recovery", detail]);
    if (options.reportError) throw Error("report failed");
  };
  const run = scheduler.createCommandScheduler(execute, resolve, report);
  return {
    trace,
    state,
    gate,
    scheduler,
    run,
    execute,
    resolve,
    report,
    get executions() {
      return executions;
    },
  };
}
async function outcome(run: any, cmd: any) {
  try {
    return { result: await run(cmd) };
  } catch (e: any) {
    return { error: e.name, message: e.message, details: e.details };
  }
}
const reasons = [
  "credential_state_unavailable",
  "credential_delivery_in_progress",
  "protected_command_failed",
  "retained_data_restricted",
  "credential_observation_restricted",
] as const;
test("q3 matches original command categories, observations, result filtering and recovery phases", async () => {
  const commands = [
    "tab_browser_auth_handoff",
    "tab_manual_handoff_request",
    "navigate_tab_url",
    "navigate_tab_back",
    "navigate_tab_forward",
    "navigate_tab_reload",
    "close_tab",
    "get_documentation",
    "get_browser_documentation",
    "get_browser",
    "get_default_browser",
    "list_browsers",
    "name_session",
    "browser_visibility_set",
    "mark_tab",
    "create_tab",
    "get_tab",
    "tab_ax_action",
    "playwright_locator_click",
    "unknown",
  ];
  let count = 0;
  for (const type of commands)
    for (const protectedState of [false, true])
      for (const mode of [
        "success",
        "rawError",
        "credentialError",
        "securityRetry",
        "securityDenied",
        "epochChange",
        "unavailableAfter",
      ]) {
        const flags: any = { protected: protectedState };
        if (type === "list_browsers")
          flags.result = [
            { id: "1", name: "Synthetic", type: "extension", extra: "strip" },
          ];
        if (mode === "rawError") flags.error = Error("synthetic error");
        if (mode === "credentialError")
          flags.error = new CredentialObservationError(
            "protected_command_failed",
          );
        if (mode === "securityRetry")
          flags.error = new BrowserUseSecurityError("approval_unavailable", "");
        if (mode === "securityDenied")
          flags.error = new BrowserUseSecurityError(
            "browser_capability_blocked",
            "",
          );
        if (mode === "epochChange") flags.changeEpoch = true;
        if (mode === "unavailableAfter") flags.resumeError = 2;
        const a = fixture(original, flags),
          b = fixture(createCommandScheduling, flags),
          cmd = { type, browser_id: "alias", tab_id: "3" };
        const expected = await outcome(a.run, cmd),
          actual = await outcome(b.run, cmd);
        assert.deepEqual(actual, expected, `${type}/${protectedState}/${mode}`);
        assert.deepEqual(b.trace, a.trace);
        count++;
        if (mode === "unavailableAfter" && b.executions)
          assert.equal(actual.details?.reason, "credential_state_unavailable");
        if (
          mode === "success" &&
          protectedState &&
          [
            "mark_tab",
            "navigate_tab_url",
            "tab_manual_handoff_request",
          ].includes(type)
        )
          assert.deepEqual(actual.result, {});
      }
  assert.equal(count, 280);
});
test("recovery reason mapping, recheck precedence, invalid new tab ids and telemetry failures match source", async () => {
  const flags: any[] = [
    { unavailable: true },
    { pending: true },
    { protected: true, resolveError: true },
    { protected: true, checkError: 1 },
    { protected: true, checkError: 2 },
    { resumeError: 1 },
    { resumeError: 2, reportError: true },
    ...reasons.map((reason) => ({
      error: new CredentialObservationError(reason),
    })),
    ...["0", "01", "-1", "1.5", "9007199254740992", 12, null, undefined].map(
      (id) => ({ result: { id }, type: "create_tab" }),
    ),
  ];
  for (const flag of flags) {
    const a = fixture(original, flag),
      b = fixture(createCommandScheduling, flag);
    const cmd = {
      type: flag.type ?? "get_tab",
      browser_id: "alias",
      tab_id: 3,
    };
    assert.deepEqual(await outcome(b.run, cmd), await outcome(a.run, cmd));
    assert.deepEqual(b.trace, a.trace);
  }
  for (const factory of [original, createCommandScheduling]) {
    const f = fixture(factory, { resumeError: 1 });
    assert.equal(await f.scheduler.shouldEmitResponseMetadata(), false);
    const p = fixture(factory, { protected: true });
    assert.equal(p.scheduler.canObserve(), false);
    assert.equal(await p.scheduler.shouldEmitResponseMetadata(), false);
    assert.equal(p.trace.length, 0);
  }
});
test("auth handoffs serialize across scheduler instances and release queue after rejection", async () => {
  for (const factory of [original, createCommandScheduling])
    for (const fail of [false, true]) {
      let entered!: () => void, release!: () => void;
      const started = new Promise<void>((r) => (entered = r)),
        gate = new Promise<void>((r) => (release = r));
      let n = 0;
      const f = fixture(factory, {
        run: async () => {
          if (++n === 1) {
            entered();
            await gate;
            if (fail) throw Error("first failure");
          }
        },
      });
      const secondScheduler = f.scheduler.createCommandScheduler(
        f.execute,
        f.resolve,
        f.report,
      );
      const first = outcome(f.run, { type: "tab_browser_auth_handoff" });
      await started;
      const second = outcome(secondScheduler, {
        type: "tab_browser_auth_handoff",
      });
      await new Promise(setImmediate);
      assert.equal(n, 1);
      release();
      const result = await first;
      assert.equal(!!result.error, fail);
      await second;
      assert.equal(n, 2);
      assert.equal(f.trace.filter((x) => x[0] === "finish").length, 2);
    }
});
test("restored scheduler uses actual credential gates: protected documents blocked, navigation sanitizes, new document permits observation", async () => {
  const state = createCredentialObservationState();
  let loaderId = "protected-document";
  const cdp: any = {
    on() {},
    removeListener() {},
    async call() {
      return {
        frameTree: {
          frame: {
            id: "frame",
            loaderId,
            url: "https://synthetic.invalid/",
            securityOrigin: "https://synthetic.invalid",
          },
        },
      };
    },
  };
  const gate = state.getGate("browser", cdp);
  await gate.protect(3);
  const scheduling = createCommandScheduling(state);
  const telemetry: any[] = [];
  let executed = 0;
  const run = scheduling.createCommandScheduler(
    async (cmd: any) => {
      executed++;
      if (cmd.type === "navigate_tab_url") {
        loaderId = "new-document";
        gate.permitNavigatedDocument(3, loaderId, gate.epoch);
      }
      return { value: "observation" };
    },
    async () => "browser",
    (d) => telemetry.push(d),
  );
  await assert.rejects(
    run({ type: "get_tab", browser_id: "alias", tab_id: 3 }),
    (error: any) =>
      error.details.reason === "credential_observation_restricted",
  );
  assert.equal(executed, 0);
  assert.deepEqual(
    await run({ type: "navigate_tab_url", browser_id: "alias", tab_id: 3 }),
    {},
  );
  assert.deepEqual(
    await run({ type: "get_tab", browser_id: "alias", tab_id: 3 }),
    { value: "observation" },
  );
  const changing = scheduling.createCommandScheduler(
    async () => {
      gate.invalidateDocuments(3);
      return { value: "must be withheld" };
    },
    async () => "browser",
    (detail) => telemetry.push(detail),
  );
  await assert.rejects(
    changing({ type: "get_tab", browser_id: "alias", tab_id: 3 }),
    (error: any) =>
      error.details.phase === "after_command" &&
      error.details.reason === "credential_observation_restricted",
  );
  assert.equal(telemetry.at(-1).observation_changed, true);
  assert.equal(executed, 2);
  assert.equal(telemetry.length, 2);
  assert.equal(scheduling.guardState(), "protected");
  assert.equal(await scheduling.shouldEmitResponseMetadata(), false);
});

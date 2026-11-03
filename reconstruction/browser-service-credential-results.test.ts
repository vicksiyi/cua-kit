import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import { CredentialLeaseResults } from "../packages/browser/src/service/credentials/lease_results";
const Original = originalServiceBindings(["Z_"]).Z_;
function fixture(useOriginal: boolean, ordinary: boolean, fail = false) {
  const trace: any[] = [];
  const cdp: any = {
    suppressRawNetworkEvents: () => () => {},
    async call(...args: any[]) {
      trace.push(args);
      if (fail) throw Error("CDP failed");
      return {};
    },
  };
  const target = {
    origin: "https://fixture.test",
    url: "https://fixture.test/login",
  };
  const unsafe = ordinary ? async () => false : undefined;
  const owner = useOriginal
    ? new Original(cdp, {}, 7, "root", target, undefined, unsafe, new Map())
    : new (CredentialLeaseResults as any)();
  Object.assign(owner, {
    cdp,
    tabId: 7,
    frameId: "root",
    target,
    unsafeOrdinaryRequest: unsafe,
    requestId: "fixed",
    async close() {
      trace.push("close");
    },
  });
  return { owner, trace };
}
test("lease outcome preserves first outcome, background versus terminal rejection and promise settlement", async () => {
  async function run(
    original: boolean,
    ordinary: boolean,
    first: string,
    kind: string,
  ) {
    const { owner } = fixture(original, ordinary);
    const resolutions: any[] = [];
    owner.whenRejected().then((value: any) => resolutions.push(value));
    owner.setOutcome(first, undefined, kind);
    owner.settleOrdinarySubmission();
    owner.setOutcome("origin_changed", "second", "main_document");
    await Promise.resolve();
    return {
      result: await owner.result(0),
      rejection: owner.currentRejection(),
      diagnostics: owner.diagnostics(),
      resolutions,
    };
  }
  for (const ordinary of [true, false])
    for (const first of ["submitted", "submission_failed", "origin_changed"])
      for (const kind of ["background", "main_document"])
        assert.deepEqual(
          await run(false, ordinary, first, kind),
          await run(true, ordinary, first, kind),
        );
  const result = await run(false, true, "submission_failed", "background");
  assert.equal(result.diagnostics.first_rejection.request_class, "background");
  assert.equal(result.diagnostics.terminal_rejection.reason, "second");
  assert.deepEqual(
    (await run(false, false, "submitted", "main_document")).resolutions,
    [],
  );
});
test("ordinary attempt diagnostics preserve phase boundaries, reserved final slot and saturating counters", () => {
  function run(original: boolean, ordinary: boolean) {
    const { owner } = fixture(original, ordinary);
    owner.beginOrdinaryFill(90, true, "https://fixture.test/submit");
    owner.completeOrdinaryFill(90);
    owner.beginOrdinarySubmit();
    for (let i = 0; i < 70; i++)
      owner.recordAttempt({ kind: "fixture", sequence: -1, phase: "wrong" });
    owner.attemptSequence = 65536;
    owner.droppedAttemptEvents = 65535;
    owner.recordAttempt({ kind: "ignored" });
    owner.completeOrdinaryAttempt("submitted");
    owner.recordAttempt({ kind: "extra" });
    owner.refreshOrdinaryDocument("new", "https://other.test");
    const diagnostics = owner.diagnostics();
    if (diagnostics.attempt_events) diagnostics.attempt_events.pop();
    return {
      diagnostics: owner.diagnostics(),
      frameId: owner.frameId,
      target: owner.target,
      phase: owner.ordinaryPhase,
      sequence: owner.attemptSequence,
    };
  }
  for (const ordinary of [true, false])
    assert.deepEqual(run(false, ordinary), run(true, ordinary));
  const result = run(false, true);
  assert.equal(result.diagnostics.attempt_events.length, 64);
  assert.equal(
    result.diagnostics.attempt_events.at(-1).kind,
    "attempt_completed",
  );
  assert.equal(result.diagnostics.dropped_attempt_events, 65535);
});
test("lease result waits preserve timeout, document cleanup and ordinary verification decisions", async () => {
  async function run(original: boolean, mode: string) {
    const { owner, trace } = fixture(
      original,
      mode !== "private",
      mode === "error" || mode === "cleanup-error",
    );
    if (mode === "cleanup-error")
      owner.rejectedDocumentCleanup = Promise.resolve();
    if (mode === "terminal")
      owner.ordinaryTerminalRejection = { outcome: "origin_changed" };
    if (mode === "settled") {
      owner.ordinarySiteSubmissionSettled = true;
      owner.ordinarySiteSubmissionVerified = true;
    }
    if (mode === "candidate" || mode === "resolved") {
      owner.candidate = {};
      if (mode === "resolved") owner.completeOrdinarySiteSubmission(true);
    }
    let ordinary;
    try {
      ordinary = await owner.ordinaryResult();
    } catch (e) {
      ordinary = (e as Error).message;
    }
    return {
      ordinary,
      verified: await owner.verifiedOrdinarySiteSubmission(0),
      result: await owner.result(0),
      trace,
    };
  }
  for (const mode of [
    "private",
    "normal",
    "error",
    "cleanup-error",
    "terminal",
    "settled",
    "candidate",
    "resolved",
  ])
    assert.deepEqual(await run(false, mode), await run(true, mode), mode);
  assert.equal((await run(false, "resolved")).verified, true);
  assert.equal((await run(false, "candidate")).verified, false);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  discoverOrStartChrome,
  BrowserStartupError,
} from "../packages/agent-loop/src/browser-startup";
import { IndependentBrowserUnavailableError } from "@core/native-host/browserConnector";

function fixture(sequence: (string[] | Error)[]) {
  let clock = 0,
    launched = 0,
    discovered = 0;
  return {
    dependencies: {
      discover: async (_directory: string) => {
        const value = sequence[Math.min(discovered++, sequence.length - 1)];
        if (value instanceof Error) throw value;
        return value;
      },
      launch: async () => {
        launched++;
      },
      now: () => clock,
      wait: async (ms: number) => {
        clock += ms;
      },
      report: (_message: string) => {},
    },
    state: () => ({ clock, launched, discovered }),
  };
}
const absent = () => new IndependentBrowserUnavailableError("no_endpoints");
test("existing connection does not launch Chrome", async () => {
  const f = fixture([["endpoint"]]);
  assert.deepEqual(await discoverOrStartChrome("/private", f.dependencies), [
    "endpoint",
  ]);
  assert.equal(f.state().launched, 0);
});
test("cold startup launches once and waits for the extension descriptor", async () => {
  const f = fixture([absent(), absent(), absent(), ["endpoint"]]);
  assert.deepEqual(await discoverOrStartChrome("/private", f.dependencies), [
    "endpoint",
  ]);
  assert.equal(f.state().launched, 1);
  assert.equal(f.state().clock, 2250);
});
test("transient disconnection recovers after one retry without opening another window", async () => {
  const f = fixture([absent(), ["endpoint"]]);
  assert.deepEqual(await discoverOrStartChrome("/private", f.dependencies), [
    "endpoint",
  ]);
  assert.deepEqual(f.state(), { clock: 2000, launched: 0, discovered: 2 });
});
test("an invalid configuration discovered during retry is not masked by startup", async () => {
  const failure = new Error("unsafe permissions");
  const f = fixture([absent(), failure]);
  await assert.rejects(
    discoverOrStartChrome("/private", f.dependencies),
    (e) => e === failure,
  );
  assert.equal(f.state().launched, 0);
});
test("missing installation and unsafe permissions do not trigger Chrome startup", async () => {
  for (const failure of [
    new IndependentBrowserUnavailableError("directory_missing"),
    new Error("unsafe permissions"),
  ]) {
    const f = fixture([failure]);
    await assert.rejects(
      discoverOrStartChrome("/private", f.dependencies),
      (e) => e === failure,
    );
    assert.equal(f.state().launched, 0);
  }
});
test("timeout is bounded and offers explicit CDP deployment without switching profiles", async () => {
  const f = fixture([absent()]);
  await assert.rejects(
    discoverOrStartChrome("/private", f.dependencies, 500),
    (e) => e instanceof BrowserStartupError && /--cdp-browser/.test(e.message),
  );
  assert.deepEqual(f.state(), { clock: 2500, launched: 1, discovered: 5 });
});
test("launch failures retain cause and do not wait for a nonexistent startup", async () => {
  const f = fixture([absent()]);
  const cause = new Error("application missing");
  f.dependencies.launch = async () => {
    throw cause;
  };
  await assert.rejects(
    discoverOrStartChrome("/private", f.dependencies),
    (e) => e instanceof BrowserStartupError && e.cause === cause,
  );
  assert.equal(f.state().clock, 2000);
});
test("cancellation during the retry delay prevents browser launch", async () => {
  const controller = new AbortController(),
    reason = Error("cancel startup");
  const f = fixture([absent()]);
  f.dependencies.wait = async () => {
    controller.abort(reason);
  };
  await assert.rejects(
    discoverOrStartChrome("/private", f.dependencies, 15000, controller.signal),
    (error) => error === reason,
  );
  assert.equal(f.state().launched, 0);
  assert.equal(f.state().discovered, 1);
});
test("cancellation after launch is propagated without claiming launch did not occur", async () => {
  const controller = new AbortController(),
    reason = Error("cancel after launch");
  const f = fixture([absent()]);
  let launched = 0;
  f.dependencies.launch = async () => {
    launched++;
    controller.abort(reason);
  };
  await assert.rejects(
    discoverOrStartChrome("/private", f.dependencies, 15000, controller.signal),
    (error) => error === reason,
  );
  assert.equal(launched, 1);
  assert.equal(f.state().discovered, 2);
});

import test from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createCommandTiming } from "../packages/browser/src/service/runtime/command_timing";
import { originalServiceBindings } from "./service-source";
function original(now: () => number) {
  return originalServiceBindings(["cce", "dce", "pce", "$6"], {
    Vx: new AsyncLocalStorage(),
    performance: { now },
  }).$6;
}
async function scenario(factory: typeof createCommandTiming) {
  let time = 0;
  const timing = factory(() => time);
  const events: any[] = [];
  const command = timing.startCommand("click", (...args) => events.push(args));
  const sentinel = new Error("fixture rejection");
  await command.run(async () => {
    time = 1.2;
    const retry = timing.startLocatorRetry();
    retry.attemptFailed();
    time = 2;
    retry.attemptFailed();
    await timing.trackElicitation(async () => {
      time = 8.4;
    })(undefined);
    time = 9.3;
    retry.finish("success");
    retry.finish("timeout");
    retry.attemptFailed();
    const timeout = timing.startLocatorRetry();
    time = 10;
    timeout.attemptFailed();
    time = 12.8;
    timeout.finish("timeout");
    await assert.rejects(
      timing.trackElicitation(async () => {
        time = 20;
        throw sentinel;
      })(undefined),
      (e) => e === sentinel,
    );
    const noRetry = timing.startLocatorRetry();
    noRetry.finish("success");
  });
  time = 25.5;
  command.finish("success");
  // The source does not make command.finish idempotent.
  time = 30;
  command.finish("failure");
  const outside = timing.startLocatorRetry();
  outside.attemptFailed();
  outside.finish("timeout");
  assert.equal(await timing.trackElicitation(async (v: number) => v + 1)(3), 4);
  return events;
}
test("command timing preserves approval subtraction, retry counts, rounding and failure identity", async () => {
  const expected = await scenario(original);
  const actual = await scenario(createCommandTiming);
  assert.deepEqual(actual, expected);
  assert.equal(actual[0][2].duration_ms, 12);
  assert.equal(actual[0][2].locator_retry_started_count, 2);
  assert.equal(actual[0][2].locator_retry_success_count, 1);
  assert.equal(actual[0][2].locator_retry_timeout_count, 1);
});
async function concurrent(factory: typeof createCommandTiming) {
  let time = 0;
  const timing = factory(() => time),
    events: any[] = [];
  let resume!: () => void;
  const gate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const a = timing.startCommand("a", (...args) => events.push(args));
  const pending = a.run(async () => {
    const tracker = timing.startLocatorRetry();
    time = 2;
    tracker.attemptFailed();
    await gate;
    time = 15;
    tracker.finish("success");
  });
  const b = timing.startCommand("b", (...args) => events.push(args));
  await b.run(async () => {
    time = 4;
    await timing.trackElicitation(async () => {
      time = 10;
    })(undefined);
    const nested = timing.startCommand("nested", (...args) =>
      events.push(args),
    );
    await nested.run(async () => {
      time = 12;
    });
    nested.finish("success");
  });
  b.finish("success");
  resume();
  await pending;
  a.finish("success");
  return events;
}
test("command timing isolates concurrent and nested async command contexts", async () => {
  const actual = await concurrent(createCommandTiming);
  assert.deepEqual(actual, await concurrent(original));
  assert.equal(actual.find((e) => e[1] === "b")[2].duration_ms, 4);
  assert.equal(
    actual.find((e) => e[1] === "b")[2].locator_retry_started_count,
    undefined,
  );
  assert.equal(
    actual.find((e) => e[1] === "a")[2].locator_retry_success_count,
    1,
  );
});

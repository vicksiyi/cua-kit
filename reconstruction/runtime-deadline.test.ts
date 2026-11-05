import test from "node:test";
import assert from "node:assert/strict";
import {
  ExecutionDeadline,
  type DeadlineClock,
} from "../packages/runtime-supervisor/src/execution-deadline";
function fakeClock() {
  let now = 0;
  const timers = new Set<{ at: number; callback: () => void }>();
  const clock: DeadlineClock = {
    now: () => now,
    schedule: (ms, callback) => {
      const t = { at: now + ms, callback };
      timers.add(t);
      return () => {
        timers.delete(t);
      };
    },
  };
  return {
    clock,
    advance(ms: number) {
      now += ms;
      for (const t of [...timers])
        if (t.at <= now) {
          timers.delete(t);
          t.callback();
        }
    },
    get timers() {
      return timers.size;
    },
  };
}
test("nested suspension preserves remaining active execution time", () => {
  const time = fakeClock();
  let expired = 0;
  const deadline = new ExecutionDeadline(100, () => expired++, time.clock);
  time.advance(40);
  deadline.suspend();
  deadline.suspend();
  time.advance(1000);
  assert.equal(expired, 0);
  deadline.resume();
  time.advance(1000);
  assert.equal(expired, 0);
  assert.equal(time.timers, 0);
  deadline.resume();
  time.advance(59);
  assert.equal(expired, 0);
  time.advance(1);
  assert.equal(expired, 1);
  time.advance(1000);
  assert.equal(expired, 1);
});
test("unmatched resume fails and disposal removes paused or active timers", () => {
  for (const paused of [false, true]) {
    const time = fakeClock();
    let expired = 0;
    const deadline = new ExecutionDeadline(50, () => expired++, time.clock);
    assert.throws(() => deadline.resume(), /Unbalanced/);
    if (paused) deadline.suspend();
    deadline.dispose();
    time.advance(1000);
    assert.equal(expired, 0);
    assert.equal(time.timers, 0);
  }
});

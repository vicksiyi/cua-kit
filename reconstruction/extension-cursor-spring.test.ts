import assert from "node:assert/strict";
import test from "node:test";
import { contentBindingsSource } from "./extension-content-source";
import {
  createCursorSpring,
  resetCursorSpring,
  advanceCursorSpring,
  cursorSpringAtRest,
  shortestAngleDelta,
  targetCursorSpringAngle,
} from "../packages/browser-extension/src/cursor_spring";
const original = new Function(
  contentBindingsSource([
    "j",
    "K",
    "Jt",
    "Ue",
    "R",
    "v",
    "I",
    "An",
    "We",
    "Ye",
    "N",
  ]) + ";return {R,v,I,We,Ye,N}",
)();
test("cursor springs match original complete trajectories, retargeting and long-frame catch-up", () => {
  for (const options of [
    { dampingFraction: 0.85, response: 0.2 },
    { dampingFraction: 0.86, response: 0.42 },
    { dampingFraction: 0.86, response: 0.12 },
    { dampingFraction: 0, response: 0 },
    { dampingFraction: 1, response: 0.001 },
    { dampingFraction: 2, response: 2 },
  ])
    for (const [value, target] of [
      [0, 100],
      [100, 0],
      [-80, -20],
      [1, 1],
      [0.00001, 0.00002],
    ]) {
      const a = original.R(value, target, options),
        b = createCursorSpring(value, target, options);
      assert.deepEqual(b, a);
      for (let frame = 0; frame < 300; frame++) {
        if (frame === 45) {
          a.target = -a.target + 0.5;
          b.target = -b.target + 0.5;
        }
        if (frame === 160) {
          resetCursorSpring(b, 12);
          original.v(a, 12);
          b.target = a.target = 88;
        }
        const dt =
          frame === 20
            ? 1.5
            : frame === 80
              ? 0
              : frame === 100
                ? -1
                : frame % 3 === 0
                  ? 1 / 120
                  : 1 / 60;
        original.I(a, dt);
        advanceCursorSpring(b, dt);
        assert.deepEqual(
          b,
          a,
          JSON.stringify({ options, value, target, frame }),
        );
        assert.equal(cursorSpringAtRest(b), original.We(a));
      }
    }
  const spring = createCursorSpring(0, 100, {
    dampingFraction: 0.85,
    response: 0.2,
  });
  for (let i = 0; i < 300; i++) advanceCursorSpring(spring, 1 / 60);
  assert.equal(spring.value, 100);
  assert.equal(cursorSpringAtRest(spring), true);
});
test("cursor spring rest and shortest-angle boundaries preserve original behavior", () => {
  for (const from of [-720, -181, -180, -1, 0, 180, 181, 720])
    for (const to of [-721, -180, 0, 180, 721]) {
      assert.equal(shortestAngleDelta(from, to), original.Ye(from, to));
      const a = original.R(from, 0, { response: 0.2, dampingFraction: 0.85 }),
        b = createCursorSpring(from, 0, {
          response: 0.2,
          dampingFraction: 0.85,
        });
      original.N(a, to);
      targetCursorSpringAngle(b, to);
      assert.deepEqual(b, a);
    }
  for (const target of [0, 1, -1])
    for (const value of [0, 0.99, 1.01, 100])
      for (const velocity of [0, 0.06, 0.060001]) {
        const spring = createCursorSpring(value, target, {
          response: 0.2,
          dampingFraction: 0.85,
        });
        spring.velocity = velocity;
        assert.equal(cursorSpringAtRest(spring), original.We(spring));
      }
  // Preserve the source's zero-target rest behavior rather than imposing a new distance rule.
  assert.equal(
    cursorSpringAtRest(
      createCursorSpring(100, 0, { response: 0.2, dampingFraction: 0.85 }),
    ),
    true,
  );
});

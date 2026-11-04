import assert from "node:assert/strict";
import test from "node:test";
import { originalCursorMotionSource } from "./extension-cursor-source";
import {
  createCursorPath,
  sampleCursorPath,
  cursorTangentAngle,
  cursorPathSpringOptions,
} from "../packages/browser-extension/src/cursor_path";
import {
  createCursorMotionState,
  moveCursorTo,
  advanceCursorMotion,
  resetCursorMotion,
  cursorMotionNeedsFrame,
  cursorThinkingRotation,
} from "../packages/browser-extension/src/cursor_motion";
const original = new Function(
  originalCursorMotionSource + ";return {rt,pe,me,it,an,cn,pn,ke,vn,xn}",
)();

test("cursor path selection, samples and spring response match original across bounds and directions", () => {
  let arcCount = 0,
    singleCount = 0;
  for (const bounds of [
    { width: 1200, height: 800 },
    { width: 40, height: 30 },
    { width: 0, height: 0 },
  ]) {
    const points = [
      { x: 0, y: 0 },
      { x: bounds.width, y: bounds.height },
      { x: bounds.width / 2, y: bounds.height / 2 },
      { x: 20, y: 20 },
      { x: -100, y: 900 },
      { x: 900, y: -100 },
    ];
    for (const start of points)
      for (const end of points) {
        const a = original.rt({ bounds, start, end }),
          b = createCursorPath({ bounds, start, end });
        assert.deepEqual(b, a);
        if (b.arc) arcCount++;
        else singleCount++;
        assert.deepEqual(cursorPathSpringOptions(b), original.it(a));
        for (const progress of [
          -1, 0, 0.001, 0.1, 0.499999, 0.5, 0.500001, 0.9, 0.999, 1, 2,
        ]) {
          const sample = sampleCursorPath(b, progress);
          assert.deepEqual(sample, original.pe(a, progress));
          assert.equal(
            cursorTangentAngle(sample.tangent),
            original.me(sample.tangent),
          );
        }
        assert.deepEqual(sampleCursorPath(b, 0).point, start);
        assert.deepEqual(sampleCursorPath(b, 1).point, end);
      }
  }
  assert.ok(arcCount > 0 && singleCount > 0);
  const empty = {
    ...createCursorPath({
      bounds: { width: 1, height: 1 },
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    }),
    segments: [],
  };
  assert.throws(() => sampleCursorPath(empty, 0), /no segment/);
});

test("cursor motion matches complete original frame state through retarget, reset, arrival and thinking", () => {
  const bounds = { width: 1200, height: 800 },
    start = { x: 400, y: 300 };
  const targets = [
    { x: 400, y: 300 },
    { x: 596, y: 300 },
    { x: 596.001, y: 300 },
    { x: 400, y: 104 },
    { x: 10, y: 790 },
    { x: 1100, y: 30 },
  ];
  for (const visible of [false, true])
    for (const target of targets) {
      const a = original.an({ ...start }, visible),
        b = createCursorMotionState({ ...start }, visible);
      assert.deepEqual(b, a);
      original.cn(a, target, bounds);
      moveCursorTo(b, target, bounds);
      assert.deepEqual(b, a);
      assert.equal(
        b.motion?.mode,
        Math.hypot(target.x - start.x, target.y - start.y) <= 196
          ? "scoot"
          : "bezier",
      );
      let arrivals = 0;
      for (let frame = 0; frame < 360; frame++) {
        const timestamp = (frame * 1000) / 60,
          elapsed =
            frame === 5
              ? -1
              : frame === 6
                ? 0
                : frame === 25
                  ? 1.5
                  : frame % 3 === 0
                    ? 1 / 120
                    : 1 / 60;
        if (frame === 12) {
          const next = { x: 1100, y: 700 };
          original.cn(a, next, bounds);
          moveCursorTo(b, next, bounds);
        }
        if (frame === 30) {
          a.visibilitySpring.target = b.visibilitySpring.target = visible
            ? 0
            : 1;
        }
        if (frame === 120) {
          original.ke(a, start);
          resetCursorMotion(b, start);
          assert.deepEqual(b, a);
          original.cn(a, target, bounds);
          moveCursorTo(b, target, bounds);
        }
        const arrived = advanceCursorMotion(b, elapsed, timestamp);
        assert.equal(arrived, original.pn(a, elapsed, timestamp));
        if (arrived) arrivals++;
        assert.deepEqual(
          b,
          a,
          `frame ${frame}, target ${JSON.stringify(target)}`,
        );
        assert.equal(cursorMotionNeedsFrame(b), original.vn(a));
        assert.equal(
          cursorThinkingRotation(b, timestamp),
          original.xn(a, timestamp),
        );
        assert.deepEqual(b, a);
      }
      assert.ok(arrivals >= 2);
      assert.equal(b.motion, null);
      assert.deepEqual(b.point, target);
      assert.equal(cursorMotionNeedsFrame(b), false);
    }
});

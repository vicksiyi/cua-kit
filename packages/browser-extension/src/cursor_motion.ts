import {
  advanceCursorSpring,
  createCursorSpring,
  cursorSpringAtRest,
  resetCursorSpring,
  targetCursorSpringAngle,
  type CursorSpring,
} from "./cursor_spring";
import {
  clampCursorValue,
  createCursorPath,
  cursorDistance,
  cursorPathSpringOptions,
  cursorTangentAngle,
  normalizeCursorVector,
  sampleCursorPath,
  wrapCursorAngle,
  type CursorBounds,
  type CursorPath,
  type CursorPoint,
} from "./cursor_path";

interface BezierMotion {
  mode: "bezier";
  path: CursorPath;
  progressSpring: CursorSpring;
}
interface ScootMotion {
  axisRotation: number;
  end: CursorPoint;
  mode: "scoot";
  progressSpring: CursorSpring;
  rotationTarget: number;
  start: CursorPoint;
}
export interface CursorMotionState {
  motion: BezierMotion | ScootMotion | null;
  point: CursorPoint;
  positionXSpring: CursorSpring;
  positionYSpring: CursorSpring;
  rotation: number;
  rotationSpring: CursorSpring;
  scootAxisRotation: number;
  scootAxisSpring: CursorSpring;
  scootRotationSpring: CursorSpring;
  scootStretchSpring: CursorSpring;
  stretchSpring: CursorSpring;
  thinkStartedAt: number | null;
  visibilitySpring: CursorSpring;
}
const positionOptions = { dampingFraction: 0.9, response: 0.19 };
const rotationOptions = { dampingFraction: 0.9, response: 0.12 };
export function createCursorMotionState(
  point: CursorPoint,
  visible: boolean,
): CursorMotionState {
  const visibility = visible ? 1 : 0,
    rotation = wrapCursorAngle(-44);
  return {
    motion: null,
    point,
    positionXSpring: createCursorSpring(point.x, point.x, positionOptions),
    positionYSpring: createCursorSpring(point.y, point.y, positionOptions),
    rotation,
    rotationSpring: createCursorSpring(rotation, rotation, rotationOptions),
    scootAxisRotation: 0,
    scootAxisSpring: createCursorSpring(0, 0, rotationOptions),
    scootRotationSpring: createCursorSpring(0, 0, {
      dampingFraction: 0.82,
      response: 0.055,
    }),
    scootStretchSpring: createCursorSpring(1, 1, {
      dampingFraction: 0.86,
      response: 0.12,
    }),
    stretchSpring: createCursorSpring(1, 1, {
      dampingFraction: 0.85,
      response: 0.2,
    }),
    thinkStartedAt: null,
    visibilitySpring: createCursorSpring(visibility, visibility, {
      dampingFraction: 0.86,
      response: 0.42,
    }),
  };
}
function configurePosition(
  state: CursorMotionState,
  response: number,
  damping: number,
): void {
  state.positionXSpring.response = response;
  state.positionYSpring.response = response;
  state.positionXSpring.dampingFraction = damping;
  state.positionYSpring.dampingFraction = damping;
}
/** Original cn/ln/un/dn/gn: 196px threshold and directional scoot targets. */
export function moveCursorTo(
  state: CursorMotionState,
  target: CursorPoint,
  bounds: CursorBounds,
): void {
  state.thinkStartedAt = null;
  const start = { x: state.point.x, y: state.point.y };
  if (cursorDistance(start, target) <= 196) {
    const direction = normalizeCursorVector({
        x: target.x - start.x,
        y: target.y - start.y,
      }),
      axisRotation =
        cursorDistance({ x: 0, y: 0 }, direction) < 0.001
          ? 0
          : Math.atan2(direction.y, direction.x) * (180 / Math.PI),
      rotationTarget =
        clampCursorValue(direction.x * 0.75 + -direction.y * 0.62, -1, 1) * 70;
    configurePosition(
      state,
      positionOptions.response,
      positionOptions.dampingFraction,
    );
    state.positionXSpring.target = target.x;
    state.positionYSpring.target = target.y;
    targetCursorSpringAngle(state.rotationSpring, wrapCursorAngle(-44));
    targetCursorSpringAngle(state.scootAxisSpring, axisRotation);
    state.motion = {
      axisRotation,
      end: target,
      mode: "scoot",
      progressSpring: createCursorSpring(0, 1, {
        dampingFraction: 0.94,
        response: 0.19,
      }),
      rotationTarget,
      start,
    };
    return;
  }
  const path = createCursorPath({ bounds, end: target, start }),
    options = cursorPathSpringOptions(path);
  configurePosition(
    state,
    clampCursorValue(options.response * 0.18, 0.035, 0.12),
    options.dampingFraction,
  );
  state.motion = {
    mode: "bezier",
    path,
    progressSpring: createCursorSpring(0, 1, options),
  };
}
function advancePosition(
  state: CursorMotionState,
  elapsed: number,
): { point: CursorPoint; speed: number } {
  const previous = state.point;
  advanceCursorSpring(state.positionXSpring, elapsed);
  advanceCursorSpring(state.positionYSpring, elapsed);
  advanceCursorSpring(state.rotationSpring, elapsed);
  advanceCursorSpring(state.scootAxisSpring, elapsed);
  const point = {
      x: state.positionXSpring.value,
      y: state.positionYSpring.value,
    },
    speed = cursorDistance(previous, point) / Math.max(elapsed, 1 / 240);
  state.point = point;
  state.rotation = state.rotationSpring.value;
  state.scootAxisRotation = state.scootAxisSpring.value;
  return { point, speed };
}
function positionArrived(
  state: CursorMotionState,
  target: CursorPoint,
): boolean {
  return (
    cursorDistance(state.point, target) <= 0.85 &&
    Math.abs(state.positionXSpring.velocity) <= 12 &&
    Math.abs(state.positionYSpring.velocity) <= 12
  );
}
function resetPosition(state: CursorMotionState, point: CursorPoint): void {
  state.point = point;
  resetCursorSpring(state.positionXSpring, point.x);
  resetCursorSpring(state.positionYSpring, point.y);
}
function resetScoot(state: CursorMotionState): void {
  resetCursorSpring(state.scootAxisSpring, 0);
  resetCursorSpring(state.scootRotationSpring, 0);
  resetCursorSpring(state.scootStretchSpring, 1);
  state.scootAxisRotation = 0;
}
export function resetCursorMotion(
  state: CursorMotionState,
  point: CursorPoint,
): void {
  state.motion = null;
  resetPosition(state, point);
  resetCursorSpring(state.rotationSpring, wrapCursorAngle(-44));
  state.rotation = state.rotationSpring.value;
  resetScoot(state);
  resetCursorSpring(state.stretchSpring, 1);
}
function advanceBezier(
  state: CursorMotionState,
  elapsed: number,
  timestamp: number,
): boolean {
  const motion = state.motion;
  if (motion?.mode !== "bezier") return false;
  state.scootStretchSpring.target = 1;
  state.scootRotationSpring.target = 0;
  advanceCursorSpring(motion.progressSpring, elapsed);
  const progress = clampCursorValue(motion.progressSpring.value, 0, 1),
    sample = sampleCursorPath(motion.path, progress),
    rotation = cursorTangentAngle(sample.tangent);
  state.positionXSpring.target = sample.point.x;
  state.positionYSpring.target = sample.point.y;
  targetCursorSpringAngle(state.rotationSpring, rotation);
  targetCursorSpringAngle(state.scootAxisSpring, 0);
  const position = advancePosition(state, elapsed);
  state.stretchSpring.target = clampCursorValue(
    1 - position.speed / 5500,
    0.65,
    1,
  );
  if (
    progress >= 0.999 &&
    Math.abs(motion.progressSpring.velocity) < 0.01 &&
    positionArrived(state, sample.point)
  ) {
    const end = sampleCursorPath(motion.path, 1),
      endRotation = cursorTangentAngle(end.tangent);
    resetPosition(state, end.point);
    resetCursorSpring(state.rotationSpring, endRotation);
    state.rotation = endRotation;
    resetCursorSpring(state.scootAxisSpring, 0);
    state.scootAxisRotation = 0;
    resetCursorSpring(state.stretchSpring, 1);
    state.motion = null;
    state.thinkStartedAt = timestamp;
    return true;
  }
  return false;
}
function segmentProgress(
  point: CursorPoint,
  start: CursorPoint,
  end: CursorPoint,
): number {
  const delta = { x: end.x - start.x, y: end.y - start.y },
    lengthSquared = delta.x * delta.x + delta.y * delta.y;
  return lengthSquared < 0.001
    ? 1
    : clampCursorValue(
        ((point.x - start.x) * delta.x + (point.y - start.y) * delta.y) /
          lengthSquared,
        0,
        1,
      );
}
function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}
function advanceScoot(
  state: CursorMotionState,
  elapsed: number,
  timestamp: number,
): boolean {
  const motion = state.motion;
  if (motion?.mode !== "scoot") return false;
  advanceCursorSpring(motion.progressSpring, elapsed);
  state.positionXSpring.target = motion.end.x;
  state.positionYSpring.target = motion.end.y;
  targetCursorSpringAngle(state.scootAxisSpring, motion.axisRotation);
  targetCursorSpringAngle(state.rotationSpring, wrapCursorAngle(-44));
  const progress = segmentProgress(
      advancePosition(state, elapsed).point,
      motion.start,
      motion.end,
    ),
    pulse = Math.sin(Math.min(1, progress) * Math.PI);
  state.stretchSpring.target = 1;
  state.scootStretchSpring.target = lerp(
    1,
    lerp(1, 0, Math.sin(clampCursorValue(progress, 0, 1) * Math.PI)),
    0.15,
  );
  state.scootRotationSpring.target = motion.rotationTarget * pulse;
  if (
    progress >= 0.999 &&
    Math.abs(motion.progressSpring.velocity) < 0.01 &&
    positionArrived(state, motion.end)
  ) {
    resetPosition(state, motion.end);
    resetCursorSpring(state.rotationSpring, wrapCursorAngle(-44));
    state.rotation = state.rotationSpring.value;
    resetScoot(state);
    resetCursorSpring(state.stretchSpring, 1);
    state.motion = null;
    state.thinkStartedAt = timestamp;
    return true;
  }
  return false;
}
function advanceMotion(
  state: CursorMotionState,
  elapsed: number,
  timestamp: number,
): boolean {
  if (state.motion == null) {
    state.stretchSpring.target = 1;
    state.scootStretchSpring.target = 1;
    state.scootRotationSpring.target = 0;
    return false;
  }
  const duration = Math.max(0, elapsed);
  state.thinkStartedAt = null;
  return state.motion.mode === "scoot"
    ? advanceScoot(state, duration, timestamp)
    : advanceBezier(state, duration, timestamp);
}
/** Original pn: arrival is reported before the four visual springs advance. */
export function advanceCursorMotion(
  state: CursorMotionState,
  elapsed: number,
  timestamp: number,
): boolean {
  const arrived = advanceMotion(state, elapsed, timestamp);
  advanceCursorSpring(state.visibilitySpring, elapsed);
  advanceCursorSpring(state.stretchSpring, elapsed);
  advanceCursorSpring(state.scootStretchSpring, elapsed);
  advanceCursorSpring(state.scootRotationSpring, elapsed);
  return arrived;
}
function settled(spring: CursorSpring): boolean {
  return spring.value === spring.target && cursorSpringAtRest(spring);
}
export function cursorMotionNeedsFrame(state: CursorMotionState): boolean {
  return (
    state.motion != null ||
    state.thinkStartedAt != null ||
    !settled(state.positionXSpring) ||
    !settled(state.positionYSpring) ||
    !settled(state.rotationSpring) ||
    !settled(state.scootAxisSpring) ||
    !settled(state.scootRotationSpring) ||
    !settled(state.scootStretchSpring) ||
    !settled(state.stretchSpring) ||
    !settled(state.visibilitySpring)
  );
}
/** Original xn mutates thinkStartedAt when its oscillation finishes. */
export function cursorThinkingRotation(
  state: CursorMotionState,
  timestamp: number,
): number {
  if (state.thinkStartedAt == null) return state.rotation;
  const elapsed = (timestamp - state.thinkStartedAt) / 1e3 - 0;
  if (elapsed < 0) return state.rotation;
  const progress = Math.min(1, elapsed / 1.41),
    envelope = Math.sin(progress * Math.PI),
    oscillation = Math.sin((elapsed / 0.66) * Math.PI * 2) * envelope;
  if (progress >= 1) {
    state.thinkStartedAt = null;
    return state.rotation;
  }
  return state.rotation + oscillation * 12.5;
}

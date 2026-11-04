import type { SpringOptions } from "./cursor_spring";

export interface CursorPoint {
  x: number;
  y: number;
}
export interface CursorBounds {
  width: number;
  height: number;
}
export interface CursorSegment {
  control1: CursorPoint;
  control2: CursorPoint;
  end: CursorPoint;
}
export interface CursorPath {
  arc: CursorPoint | null;
  arcIn: CursorPoint | null;
  arcOut: CursorPoint | null;
  end: CursorPoint;
  endControl: CursorPoint;
  segments: CursorSegment[];
  start: CursorPoint;
  startControl: CursorPoint;
}
interface PathConfig {
  arcFlow: number;
  arcSize: number;
  boundsMargin: number;
  candidateCount: number;
  clickAngleDegrees: number;
  endpointHandle: number;
  startHandle: number;
}
const config: PathConfig = {
  arcFlow: 0.5783555327868779,
  arcSize: 0.2765523188064277,
  boundsMargin: 20,
  candidateCount: 20,
  clickAngleDegrees: -44,
  endpointHandle: 0.15,
  startHandle: 0.41960295031576633,
};
export function clampCursorValue(
  value: number,
  min: number,
  max: number,
): number {
  return Math.max(min, Math.min(max, value));
}
export function cursorDistance(start: CursorPoint, end: CursorPoint): number {
  const x = end.x - start.x,
    y = end.y - start.y;
  return Math.sqrt(x * x + y * y);
}
export function normalizeCursorVector(point: CursorPoint): CursorPoint {
  const length = Math.sqrt(point.x * point.x + point.y * point.y);
  return length < 0.001
    ? { x: 1, y: 0 }
    : { x: point.x / length, y: point.y / length };
}
export function wrapCursorAngle(angle: number): number {
  const remainder = angle % 360;
  return remainder < 0 ? remainder + 360 : remainder;
}
function clickTangent(degrees: number): CursorPoint {
  const radians = degrees * (Math.PI / 180);
  return { x: Math.sin(radians), y: -Math.cos(radians) };
}
export function cursorTangentAngle(tangent: CursorPoint): number {
  if (cursorDistance({ x: 0, y: 0 }, tangent) < 0.001)
    return wrapCursorAngle(-44);
  const unit = normalizeCursorVector(tangent);
  return wrapCursorAngle(Math.atan2(unit.y, unit.x) * (180 / Math.PI) + 90);
}
function boundedControl(
  bounds: CursorBounds,
  point: CursorPoint,
  direction: CursorPoint,
  distance: number,
): CursorPoint {
  let limited = distance;
  if (direction.x < 0) limited = Math.min(limited, point.x / -direction.x);
  if (direction.x > 0)
    limited = Math.min(limited, (bounds.width - point.x) / direction.x);
  if (direction.y < 0) limited = Math.min(limited, point.y / -direction.y);
  if (direction.y > 0)
    limited = Math.min(limited, (bounds.height - point.y) / direction.y);
  return {
    x: point.x + direction.x * Math.max(0, limited),
    y: point.y + direction.y * Math.max(0, limited),
  };
}
function cubicPoint(
  start: CursorPoint,
  control1: CursorPoint,
  control2: CursorPoint,
  end: CursorPoint,
  progress: number,
): CursorPoint {
  const inverse = 1 - progress,
    a = inverse * inverse * inverse,
    b = 3 * inverse * inverse * progress,
    c = 3 * inverse * progress * progress,
    d = progress * progress * progress;
  return {
    x: start.x * a + control1.x * b + control2.x * c + end.x * d,
    y: start.y * a + control1.y * b + control2.y * c + end.y * d,
  };
}
function cubicTangent(
  start: CursorPoint,
  segment: CursorSegment,
  progress: number,
): CursorPoint {
  const inverse = 1 - progress;
  return {
    x:
      3 * inverse * inverse * (segment.control1.x - start.x) +
      6 * inverse * progress * (segment.control2.x - segment.control1.x) +
      3 * progress * progress * (segment.end.x - segment.control2.x),
    y:
      3 * inverse * inverse * (segment.control1.y - start.y) +
      6 * inverse * progress * (segment.control2.y - segment.control1.y) +
      3 * progress * progress * (segment.end.y - segment.control2.y),
  };
}
/** Original pe: progress divides segments equally, not by their arc length. */
export function sampleCursorPath(
  path: CursorPath,
  progress: number,
): { point: CursorPoint; tangent: CursorPoint } {
  const bounded = clampCursorValue(progress, 0, 1),
    scaled =
      bounded === 1 ? path.segments.length - 1 : bounded * path.segments.length,
    index = Math.floor(scaled),
    segment = path.segments[index];
  if (segment == null)
    throw new Error("Cursor motion path has no segment for progress");
  const previous = path.segments[index - 1],
    start = index === 0 ? path.start : previous?.end;
  if (start == null)
    throw new Error("Cursor motion path segment is missing its start point");
  const local = bounded === 1 ? 1 : scaled - index;
  return {
    point: cubicPoint(
      start,
      segment.control1,
      segment.control2,
      segment.end,
      local,
    ),
    tangent: cubicTangent(start, segment, local),
  };
}
function singleSegment(
  start: CursorPoint,
  end: CursorPoint,
  startControl: CursorPoint,
  endControl: CursorPoint,
): CursorPath {
  return {
    arc: null,
    arcIn: null,
    arcOut: null,
    end,
    endControl,
    segments: [{ control1: startControl, control2: endControl, end }],
    start,
    startControl,
  };
}
function arcSegment(
  start: CursorPoint,
  end: CursorPoint,
  startControl: CursorPoint,
  endControl: CursorPoint,
  arc: CursorPoint,
  arcIn: CursorPoint,
  arcOut: CursorPoint,
): CursorPath {
  return {
    arc,
    arcIn,
    arcOut,
    end,
    endControl,
    segments: [
      { control1: startControl, control2: arcIn, end: arc },
      { control1: arcOut, control2: endControl, end },
    ],
    start,
    startControl,
  };
}
/** Original st/at/fe: generate both arc sides in original order before slicing. */
function candidates(
  bounds: CursorBounds,
  start: CursorPoint,
  end: CursorPoint,
  options: PathConfig,
): CursorPath[] {
  const tangent = clickTangent(options.clickAngleDegrees),
    distance = cursorDistance(start, end),
    delta = { x: end.x - start.x, y: end.y - start.y },
    direction = normalizeCursorVector(delta),
    startDistance = Math.max(
      48,
      Math.min(640, distance * options.startHandle, distance * 0.9),
    ),
    endDistance = Math.max(
      48,
      Math.min(640, distance * options.endpointHandle, distance * 0.9),
    ),
    reverse = { x: -tangent.x, y: -tangent.y },
    startControl = boundedControl(bounds, start, tangent, startDistance),
    endControl = boundedControl(bounds, end, reverse, endDistance),
    normal = { x: -direction.y, y: direction.x },
    side = normal.x * tangent.x + normal.y * tangent.y >= 0 ? 1 : -1,
    naturalNormal = { x: normal.x * side, y: normal.y * side },
    midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    shortStart = boundedControl(bounds, start, tangent, startDistance * 0.65),
    shortEnd = boundedControl(bounds, end, reverse, endDistance * 0.65),
    arcTangent = normalizeCursorVector(delta),
    arcDistance = Math.max(50, Math.min(520, distance * options.arcSize)),
    arcHandle = Math.max(38, Math.min(440, distance * options.arcFlow)),
    result = [
      singleSegment(start, end, startControl, endControl),
      singleSegment(start, end, shortStart, shortEnd),
    ];
  for (const distanceScale of [0.55, 0.8, 1.05]) {
    for (const handleScale of [0.65, 1, 1.35]) {
      for (const arcNormal of [
        naturalNormal,
        { x: -naturalNormal.x, y: -naturalNormal.y },
      ]) {
        const offset = arcDistance * distanceScale,
          handle = arcHandle * handleScale,
          arc = {
            x:
              midpoint.x +
              arcNormal.x * offset +
              tangent.x * startDistance * 0.16,
            y:
              midpoint.y +
              arcNormal.y * offset +
              tangent.y * startDistance * 0.16,
          },
          arcIn = {
            x: arc.x - arcTangent.x * handle,
            y: arc.y - arcTangent.y * handle,
          },
          arcOut = {
            x: arc.x + arcTangent.x * handle,
            y: arc.y + arcTangent.y * handle,
          };
        result.push(
          arcSegment(start, end, startControl, endControl, arc, arcIn, arcOut),
        );
      }
    }
  }
  return result.slice(0, options.candidateCount);
}
interface PathMetrics {
  angleChangeEnergy: number;
  length: number;
  maxAngleChange: number;
  staysInBounds: boolean;
  totalTurn: number;
}
function withinBounds(
  point: CursorPoint,
  bounds: CursorBounds,
  margin: number,
): boolean {
  return (
    point.x >= margin &&
    point.x <= bounds.width - margin &&
    point.y >= margin &&
    point.y <= bounds.height - margin
  );
}
function angleDelta(from: number, to: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}
function measurePath(
  path: CursorPath,
  bounds?: CursorBounds,
  options?: PathConfig,
): PathMetrics {
  let length = 0,
    angleChangeEnergy = 0,
    maxAngleChange = 0,
    totalTurn = 0,
    previousAngle: number | null = null,
    staysInBounds =
      bounds == null || options == null
        ? true
        : withinBounds(path.start, bounds, options.boundsMargin),
    segmentStart = path.start,
    previousPoint = path.start;
  for (const segment of path.segments) {
    for (let step = 1; step <= 24; step += 1) {
      const progress = step / 24,
        point = cubicPoint(
          segmentStart,
          segment.control1,
          segment.control2,
          segment.end,
          progress,
        );
      length += cursorDistance(previousPoint, point);
      if (bounds != null && options != null)
        staysInBounds =
          staysInBounds && withinBounds(point, bounds, options.boundsMargin);
      const delta = {
        x: point.x - previousPoint.x,
        y: point.y - previousPoint.y,
      };
      if (cursorDistance({ x: 0, y: 0 }, delta) > 0.01) {
        const angle = Math.atan2(delta.y, delta.x);
        if (previousAngle != null) {
          const change = angleDelta(previousAngle, angle);
          angleChangeEnergy += change * change;
          maxAngleChange = Math.max(maxAngleChange, Math.abs(change));
          totalTurn += Math.abs(change);
        }
        previousAngle = angle;
      }
      previousPoint = point;
    }
    segmentStart = segment.end;
  }
  return {
    angleChangeEnergy,
    length,
    maxAngleChange,
    staysInBounds,
    totalTurn,
  };
}
function reverseDirectionPenalty(path: CursorPath): number {
  const tangent = clickTangent(-44),
    direction = normalizeCursorVector({
      x: path.end.x - path.start.x,
      y: path.end.y - path.start.y,
    });
  return clampCursorValue(
    (-(direction.x * tangent.x + direction.y * tangent.y) - 0.08) / 0.92,
    0,
    1,
  );
}
function scorePath(path: CursorPath, metrics: PathMetrics): number {
  const direct = Math.max(1, cursorDistance(path.start, path.end)),
    excess = Math.max(0, metrics.length / direct - 1),
    arcCost = path.arc == null ? 0 : 45,
    reverse = reverseDirectionPenalty(path);
  return (
    metrics.length +
    excess * 320 +
    metrics.angleChangeEnergy * 140 +
    metrics.maxAngleChange * 180 +
    metrics.totalTurn * 18 +
    reverse * 90 +
    arcCost
  );
}
/** Original rt/lt: prefer an in-bounds candidate, fall back to lowest cost. */
export function createCursorPath({
  bounds,
  start,
  end,
}: {
  bounds: CursorBounds;
  start: CursorPoint;
  end: CursorPoint;
}): CursorPath {
  const paths = candidates(bounds, start, end, config),
    first = paths[0];
  if (first == null)
    throw new Error("Cursor motion requires at least one candidate");
  let bestInBounds = first,
    bestInBoundsScore = Number.POSITIVE_INFINITY,
    best = first,
    bestScore = Number.POSITIVE_INFINITY;
  for (const path of paths) {
    const metrics = measurePath(path, bounds, config),
      score = scorePath(path, metrics);
    if (score < bestScore) {
      best = path;
      bestScore = score;
    }
    if (metrics.staysInBounds && score < bestInBoundsScore) {
      bestInBounds = path;
      bestInBoundsScore = score;
    }
  }
  return bestInBoundsScore === Number.POSITIVE_INFINITY ? best : bestInBounds;
}
/** Original it/dt: derive progress spring response from sampled path geometry. */
export function cursorPathSpringOptions(path: CursorPath): SpringOptions {
  const metrics = measurePath(path),
    direct = Math.max(1, cursorDistance(path.start, path.end)),
    excess = Math.max(0, metrics.length / direct - 1),
    distanceWeight = clampCursorValue((metrics.length - 180) / 760, 0, 1),
    excessWeight = clampCursorValue(excess / 0.55, 0, 1),
    turnWeight = clampCursorValue(metrics.totalTurn / (Math.PI * 1.4), 0, 1),
    energyWeight = clampCursorValue(metrics.angleChangeEnergy / 1.25, 0, 1),
    complexity = clampCursorValue(
      excessWeight * 0.42 + turnWeight * 0.38 + energyWeight * 0.2,
      0,
      1,
    ),
    reverse = reverseDirectionPenalty(path),
    arcExtra = path.arc == null ? 0 : 0.04,
    reverseExtra = reverse * 0.28,
    arcScale = path.arc == null ? 1 : 0.9;
  return {
    dampingFraction: 0.9,
    response: clampCursorValue(
      (0.42 +
        distanceWeight * 0.22 +
        complexity * 0.12 +
        reverseExtra +
        arcExtra) *
        0.7 *
        arcScale,
      0.12,
      2.2,
    ),
  };
}

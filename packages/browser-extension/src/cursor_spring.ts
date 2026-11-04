export interface SpringOptions {
  dampingFraction: number;
  response: number;
}
export interface CursorSpring extends SpringOptions {
  force: number;
  simulationTime: number;
  scriptTime: number;
  target: number;
  value: number;
  velocity: number;
}
const integrationStep = 1 / 240;
const frameStep = 1 / 60;
const restThreshold = 0.001 * 60;
/** Original R/v/I/An/We; retain integration order and original rest test. */
export function createCursorSpring(
  value: number,
  target: number,
  options: SpringOptions,
): CursorSpring {
  return {
    dampingFraction: options.dampingFraction,
    force: 0,
    response: options.response,
    simulationTime: 0,
    scriptTime: 0,
    target,
    value,
    velocity: 0,
  };
}
export function resetCursorSpring(spring: CursorSpring, value: number): void {
  spring.force = 0;
  spring.simulationTime = 0;
  spring.scriptTime = 0;
  spring.target = value;
  spring.value = value;
  spring.velocity = 0;
}
export function cursorSpringAtRest(spring: CursorSpring): boolean {
  if (
    Math.max(spring.velocity * spring.velocity, spring.force * spring.force) >
    restThreshold * restThreshold
  )
    return false;
  const tolerance = spring.target * 0.01,
    distance = spring.target - spring.value;
  return tolerance === 0 || distance * distance <= tolerance * tolerance;
}
function integrateSpring(
  spring: CursorSpring,
  stiffness: number,
  damping: number,
): void {
  const halfStep = integrationStep / 2,
    halfVelocity = spring.velocity + spring.force * halfStep;
  spring.value += halfVelocity * integrationStep;
  spring.force =
    halfVelocity * -damping + (spring.target - spring.value) * stiffness;
  spring.velocity = halfVelocity + spring.force * halfStep;
}
export function advanceCursorSpring(
  spring: CursorSpring,
  elapsed: number,
): void {
  const response = Math.max(0.001, spring.response),
    maximumStiffness = 1 / (2 * integrationStep ** 2),
    stiffness = Math.min((Math.PI * 2) ** 2 / response ** 2, maximumStiffness),
    damping = Math.sqrt(stiffness) * 2 * spring.dampingFraction;
  spring.scriptTime += Math.max(0, elapsed);
  if (spring.scriptTime - spring.simulationTime > 1)
    spring.simulationTime = spring.scriptTime - frameStep;
  while (spring.simulationTime < spring.scriptTime) {
    integrateSpring(spring, stiffness, damping);
    spring.simulationTime += integrationStep;
  }
  if (cursorSpringAtRest(spring)) spring.value = spring.target;
}
/** Original Ye/N: shortest-angle targeting retains unwrapped spring values. */
export function shortestAngleDelta(from: number, to: number): number {
  let delta = to - from;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}
export function targetCursorSpringAngle(
  spring: CursorSpring,
  target: number,
): void {
  spring.target = spring.value + shortestAngleDelta(spring.value, target);
}

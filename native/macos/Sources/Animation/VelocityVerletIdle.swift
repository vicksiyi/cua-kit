// Native idle predicate 0x1007e80f4. Preserve the positive-relative-tolerance
// guard: a zero/NaN squared tolerance skips the position rejection entirely.
public func velocityVerletIsIdle<Vector: AnimatableVector>(
    position: Vector, target: Vector, velocity: Vector, force: Vector,
    threshold: Vector.Scalar
) -> Bool {
    if velocityVerletExceedsMotionThreshold(velocity: velocity, force: force, threshold: threshold) { return false }
    let fraction: Vector.Scalar = 0.01
    let scaledTarget = target * Vector(repeating: fraction)
    let difference = target - position
    let toleranceSquared = scaledTarget.magnitudeSquared()
    if toleranceSquared > 0, difference.magnitudeSquared() > toleranceSquared { return false }
    return true
}

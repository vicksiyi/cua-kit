// First gate of native idle predicate 0x1007e8410..0x1007e84d4.
// This gate alone is not the complete idle test: position checks follow it.
public func velocityVerletExceedsMotionThreshold<Vector: AnimatableVector>(
    velocity: Vector, force: Vector, threshold: Vector.Scalar
) -> Bool {
    let velocitySquared = velocity.magnitudeSquared()
    let forceSquared = force.magnitudeSquared()
    let motionSquared = Swift.max(velocitySquared, forceSquared)
    return motionSquared > threshold * threshold
}

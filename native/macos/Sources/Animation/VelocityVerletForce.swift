// Native 0x1007e9ad4..0x1007ea138: negate drag before multiplication,
// form target-position, multiply stiffness, then add damping and spring terms.
public func velocityVerletForce<Vector: AnimatableVector>(
    position: Vector, target: Vector, halfStepVelocity: Vector,
    stiffness: Vector.Scalar, drag: Vector.Scalar
) -> Vector {
    let damping = Vector(repeating: -drag) * halfStepVelocity
    let displacement = target - position
    let spring = displacement * Vector(repeating: stiffness)
    return damping + spring
}

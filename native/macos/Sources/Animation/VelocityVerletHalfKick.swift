// Native first integration stage 0x1007e9404..0x1007e9758. Halve dt in
// Double before converting to Scalar, multiply force, then add velocity.
public func velocityVerletHalfKick<Vector: AnimatableVector>(
    velocity: Vector, force: Vector, dt: Double
) -> Vector {
    let halfStep = Vector.Scalar(dt * 0.5)
    let impulse = force * Vector(repeating: halfStep)
    return velocity + impulse
}

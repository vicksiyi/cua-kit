// Native 0x1007e97a8..0x1007e9ad0: convert full Double dt to Scalar,
// multiply the half-step velocity, add to position, then write position back.
public func velocityVerletDrift<Vector: AnimatableVector>(
    position: Vector, halfStepVelocity: Vector, dt: Double
) -> Vector {
    let step = Vector.Scalar(dt)
    let displacement = halfStepVelocity * Vector(repeating: step)
    return position + displacement
}

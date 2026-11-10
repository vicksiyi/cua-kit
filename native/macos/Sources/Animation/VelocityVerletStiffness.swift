// Native VelocityVerletSimulation.Configuration helper 0x1007e8940.
// Nonpositive or NaN response yields infinity. Positive infinity follows the
// division path and yields zero. Convert 2*pi to Scalar before arithmetic.
public func velocityVerletStiffness<Scalar: AnimatableScalar>(response: Scalar) -> Scalar {
    guard response > 0 else { return .infinity }
    let frequency = Scalar(6.283185307179586) / response
    return frequency * frequency
}

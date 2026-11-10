// Native SpringAnimation.isLogicallyComplete 0x1007c7988. This timing-based
// predicate is distinct from simulation idle detection used to end rendering.
public func springAnimationIsLogicallyComplete<Scalar: AnimatableScalar>(
    startTime: Double?, state: AnimationState, simulationTime: Double, response: Scalar
) -> Bool {
    guard let startTime else { return state == .ended }
    return Scalar(simulationTime - startTime) >= response
}

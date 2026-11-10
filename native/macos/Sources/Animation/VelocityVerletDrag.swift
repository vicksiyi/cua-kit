// Native helper 0x1007e8b5c: sqrt(stiffness), multiply by Scalar(2), then
// multiply by dampingFraction. Preserve this order and IEEE edge behavior.
public func velocityVerletDrag<Scalar: AnimatableScalar>(
    dampingFraction: Scalar, stiffness: Scalar
) -> Scalar {
    let root = stiffness.squareRoot()
    let doubled = root * Scalar(2)
    return doubled * dampingFraction
}

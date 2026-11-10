// Native Bezier kernel 0x1007c307c: nonpositive/NaN duration traps;
// missing start or elapsed outside the inclusive interval yields no value.
public func bezierAnimationProgress(
    targetTimestamp: Double, startTime: Double?, duration: Double
) -> Double? {
    precondition(duration > 0)
    guard let startTime else { return nil }
    let elapsed = targetTimestamp - startTime
    guard elapsed >= 0 && elapsed <= duration else { return nil }
    let ratio = elapsed / duration
    let lowerBounded = ratio >= 0 ? ratio : 0
    return lowerBounded > 1 ? 1 : lowerBounded
}

// Native projection after curve solving: subtract, multiply, then add.
// Curve solving is composed by interpolateBezierAnimationValue below.
public func projectBezierAnimationValue<Vector: AnimatableVector>(
    initial: Vector, target: Vector, factor: Vector.Scalar
) -> Vector {
    let difference = target - initial
    let scaled = difference * Vector(repeating: factor)
    return initial + scaled
}


// Native Bezier timing -> scalar curve solve (epsilon 0.0001) -> SIMD projection.
// Complete animation ownership/state management is a separate layer.
public func interpolateBezierAnimationValue<Vector: AnimatableVector>(
    with update: AnimationUpdate, startTime: Double?, duration: Double,
    curve: BezierFunction<Vector.Scalar>, initial: Vector, target: Vector
) -> Vector? {
    guard let progress = bezierAnimationProgress(targetTimestamp: update.targetTimestamp,
        startTime: startTime, duration: duration) else { return nil }
    let factor = curve.solve(x: Vector.Scalar(progress), epsilon: Vector.Scalar(0.0001))
    return projectBezierAnimationValue(initial: initial, target: target, factor: factor)
}

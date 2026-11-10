// Reconstruction entry for native constructor helper 0x1007c2c6c. Original
// resolves Double control points, converts each to Scalar, then recomputes all
// coefficients with BezierFunction.init. It does not narrow cached coefficients.
public func resolveBezierAnimationParameters<Scalar: AnimatableScalar>(
    _ parameters: BezierParameters, as scalar: Scalar.Type
) -> (curve: BezierFunction<Scalar>, duration: Double) {
    let curve: BezierFunction<Double>
    switch parameters.curve {
    case .custom(let custom): curve = custom
    case .linear: curve = .linear
    case .easeIn: curve = .easeIn
    case .easeOut: curve = .easeOut
    case .easeInOut: curve = .easeInOut
    }
    return (BezierFunction(x1: Scalar(curve.x1), y1: Scalar(curve.y1),
        x2: Scalar(curve.x2), y2: Scalar(curve.y2)), parameters.duration)
}

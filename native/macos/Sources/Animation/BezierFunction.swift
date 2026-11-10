// Native descriptor 0x1012ce070 stores all four control coordinates and six
// coefficients. Curve inversion is restored separately from polynomial evaluation.
public struct BezierFunction<Scalar: AnimatableScalar>: Hashable {
    public let x1: Scalar
    public let x2: Scalar
    public let y1: Scalar
    public let y2: Scalar
    private let cx: Scalar
    private let cy: Scalar
    private let bx: Scalar
    private let by: Scalar
    private let ax: Scalar
    private let ay: Scalar

    public init(x1: Scalar, y1: Scalar, x2: Scalar, y2: Scalar) {
        self.x1 = x1; self.x2 = x2; self.y1 = y1; self.y2 = y2
        cx = 3 * x1
        cy = 3 * y1
        bx = 3 * (x2 - x1) - cx
        by = 3 * (y2 - y1) - cy
        ax = 1 - cx - bx
        ay = 1 - cy - by
    }
    public func evaluateCurveX(t: Scalar) -> Scalar { ((ax * t + bx) * t + cx) * t }
    public func evaluateCurveY(t: Scalar) -> Scalar { ((ay * t + by) * t + cy) * t }
    public func solveForT(x: Scalar, epsilon: Scalar) -> Scalar {
        solveForT(value: x, epsilon: epsilon, evaluate: evaluateCurveX,
            derivative: { t in ((3 * ax * t) + 2 * bx) * t + cx })
    }
    public func solveForT(y: Scalar, epsilon: Scalar) -> Scalar {
        solveForT(value: y, epsilon: epsilon, evaluate: evaluateCurveY,
            derivative: { t in ((3 * ay * t) + 2 * by) * t + cy })
    }
    // Native shared solver 0x1007d8be4: eight Newton attempts, then bisection.
    // No extra tolerance validation, iteration cap or stagnation exit is added.
    private func solveForT(value: Scalar, epsilon: Scalar,
        evaluate: (Scalar) -> Scalar, derivative: (Scalar) -> Scalar) -> Scalar {
        var t = value
        for _ in 0..<8 {
            let error = evaluate(t) - value
            if Swift.abs(error) < epsilon { return t }
            let slope = derivative(t)
            if Swift.abs(slope) < Scalar(0.000001) { break }
            t -= error / slope
        }
        var lower: Scalar = 0
        var upper: Scalar = 1
        t = value
        if t < lower { return lower }
        if t > upper { return upper }
        while lower < upper {
            let sampled = evaluate(t)
            if Swift.abs(sampled - value) < epsilon { return t }
            if value > sampled { lower = t } else { upper = t }
            t = (upper - lower) * Scalar(0.5) + lower
        }
        return t
    }
    public func solve(x: Scalar, epsilon: Scalar) -> Scalar {
        evaluateCurveY(t: solveForT(x: x, epsilon: epsilon))
    }
    public func solve(y: Scalar, epsilon: Scalar) -> Scalar {
        evaluateCurveX(t: solveForT(y: y, epsilon: epsilon))
    }
    public static var linear: Self { Self(x1: 0, y1: 0, x2: 1, y2: 1) }
    public static var easeIn: Self { Self(x1: Scalar(0.42), y1: 0, x2: 1, y2: 1) }
    public static var easeOut: Self { Self(x1: 0, y1: 0, x2: Scalar(0.58), y2: 1) }
    public static var easeInOut: Self { Self(x1: Scalar(0.42), y1: 0, x2: Scalar(0.58), y2: 1) }
}

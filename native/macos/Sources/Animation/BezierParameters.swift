// Native configuration descriptors 0x1012ce0ac/0x1012ce0c8. Constructors
// store duration unchanged; positive-duration enforcement belongs to the kernel.
public struct BezierParameters: Hashable {
    public enum Curve: Hashable {
        case custom(BezierFunction<Double>)
        case linear
        case easeIn
        case easeOut
        case easeInOut
    }
    public let curve: Curve
    public let duration: Double

    public init(_ curve: Curve, duration: Double) {
        self.curve = curve
        self.duration = duration
    }
    public init(curve: BezierFunction<Double>, duration: Double) {
        self.init(.custom(curve), duration: duration)
    }
}

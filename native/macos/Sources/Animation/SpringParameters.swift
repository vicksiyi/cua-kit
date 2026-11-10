import Foundation

// Descriptor 0x1012ce0e4: response and dampingFraction. These constructors
// preserve native floating-point behavior, including invalid/negative inputs.
public struct SpringParameters: Hashable {
    public let response: Double
    public let dampingFraction: Double
    public init(response: Double, dampingFraction: Double) {
        self.response = response
        self.dampingFraction = dampingFraction
    }
    // 0x1007dbcc0: nonfinite stiffness yields zero response; finite negative
    // values proceed through sqrt and therefore produce NaN.
    public init(stiffness: Double, dampingFraction: Double) {
        self.init(response: stiffness.isFinite ? (2 * Double.pi) / sqrt(stiffness) : 0,
            dampingFraction: dampingFraction)
    }

    // 0x1007dbcf0: duration is stored as response unchanged. Bounce below
    // zero uses reciprocal damping; positive bounce saturates at one.
    public init(duration: Double, bounce: Double) {
        let damping: Double
        if bounce <= -1 { damping = .infinity }
        else if bounce < 0 { damping = 1 / (1 + bounce) }
        else if bounce == 0 { damping = 1 }
        else { damping = 1 - (bounce > 1 ? 1 : bounce) }
        self.init(response: duration, dampingFraction: damping)
    }
    public static var smooth: Self { Self(response: 0.5, dampingFraction: 1) }
    public static var snappy: Self { Self(response: 0.5, dampingFraction: 0.85) }
    public static var bouncy: Self { Self(response: 0.5, dampingFraction: 0.7) }
    public static func smooth(duration: Double, extraBounce: Double = 0) -> Self {
        Self(duration: duration, bounce: extraBounce)
    }
    public static func snappy(duration: Double, extraBounce: Double = 0) -> Self {
        Self(duration: duration, bounce: extraBounce + 0.15)
    }
    public static func bouncy(duration: Double, extraBounce: Double = 0) -> Self {
        Self(duration: duration, bounce: extraBounce + 0.3)
    }
}

import CoreGraphics

extension CGFloat: SIMDRepresentable {
    public typealias SIMDType = SIMD1<Double>
    public init(_ simdRepresentation: SIMDType) { self.init(simdRepresentation[0]) }
    public func simdRepresentation() -> SIMDType { SIMDType(Double(self)) }
}

extension CGPoint: SIMDRepresentable {
    public typealias SIMDType = SIMD2<Double>
    public init(_ simdRepresentation: SIMDType) {
        self.init(x: simdRepresentation[0], y: simdRepresentation[1])
    }
    public func simdRepresentation() -> SIMDType { SIMDType(Double(x), Double(y)) }
    // Native CGPoint comparison is scalar-relative on x then y, distinct from
    // AnimatableVector's absolute whole-vector-max comparison.
    public func isAlmostEqual(to other: CGPoint, tolerance: CGFloat) -> Bool {
        x.isAlmostEqual(to: other.x, tolerance: tolerance)
            && y.isAlmostEqual(to: other.y, tolerance: tolerance)
    }
}

extension CGSize: SIMDRepresentable {
    public typealias SIMDType = SIMD2<Double>
    public init(_ simdRepresentation: SIMDType) {
        self.init(width: simdRepresentation[0], height: simdRepresentation[1])
    }
    public func simdRepresentation() -> SIMDType { SIMDType(Double(width), Double(height)) }
}

extension CGRect: SIMDRepresentable {
    public typealias SIMDType = SIMD4<Double>
    public init(_ simdRepresentation: SIMDType) {
        self.init(x: simdRepresentation[0], y: simdRepresentation[1],
                  width: simdRepresentation[2], height: simdRepresentation[3])
    }
    public func simdRepresentation() -> SIMDType {
        SIMDType(Double(origin.x), Double(origin.y), Double(size.width), Double(size.height))
    }
}

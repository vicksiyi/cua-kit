// Native scalar adapters use SIMD1 (not a two-logical-lane replacement).
extension Float: AnimatableScalar, SIMDRepresentable, ApproximatelyEquatable {
    public typealias SIMDType = SIMD1<Float>
    public typealias Epsilon = Float
    public init(_ simdRepresentation: SIMD1<Float>) { self = simdRepresentation[0] }
    public func simdRepresentation() -> SIMD1<Float> { SIMD1(self) }
}

extension Double: AnimatableScalar, SIMDRepresentable, ApproximatelyEquatable {
    public typealias SIMDType = SIMD1<Double>
    public typealias Epsilon = Double
    public init(_ simdRepresentation: SIMD1<Double>) { self = simdRepresentation[0] }
    public func simdRepresentation() -> SIMD1<Double> { SIMD1(self) }
}

extension SIMD1: SIMDRepresentable, ApproximatelyEquatable, AnimatableVector,
    Comparable where Scalar: AnimatableScalar {
    public typealias SIMDType = Self
    public typealias Epsilon = Scalar
}

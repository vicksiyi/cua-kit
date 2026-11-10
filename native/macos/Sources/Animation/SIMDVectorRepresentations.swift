// Native conditional SIMD2/3/4/8/16/32 animation conformances.
// Reuse standard Swift storage and arithmetic; route norms through Scalar.

extension SIMD2: SIMDRepresentable, ApproximatelyEquatable, AnimatableVector,
    Comparable where Scalar: AnimatableScalar {
    public typealias SIMDType = Self
    public typealias Epsilon = Scalar
    public func magnitude() -> Scalar { Scalar.length(self) }
    public func magnitudeSquared() -> Scalar { Scalar.lengthSquared(self) }
}

extension SIMD3: SIMDRepresentable, ApproximatelyEquatable, AnimatableVector,
    Comparable where Scalar: AnimatableScalar {
    public typealias SIMDType = Self
    public typealias Epsilon = Scalar
    public func magnitude() -> Scalar { Scalar.length(self) }
    public func magnitudeSquared() -> Scalar { Scalar.lengthSquared(self) }
}

extension SIMD4: SIMDRepresentable, ApproximatelyEquatable, AnimatableVector,
    Comparable where Scalar: AnimatableScalar {
    public typealias SIMDType = Self
    public typealias Epsilon = Scalar
    public func magnitude() -> Scalar { Scalar.length(self) }
    public func magnitudeSquared() -> Scalar { Scalar.lengthSquared(self) }
}

extension SIMD8: SIMDRepresentable, ApproximatelyEquatable, AnimatableVector,
    Comparable where Scalar: AnimatableScalar {
    public typealias SIMDType = Self
    public typealias Epsilon = Scalar
    public func magnitude() -> Scalar { Scalar.length(self) }
    public func magnitudeSquared() -> Scalar { Scalar.lengthSquared(self) }
}

extension SIMD16: SIMDRepresentable, ApproximatelyEquatable, AnimatableVector,
    Comparable where Scalar: AnimatableScalar {
    public typealias SIMDType = Self
    public typealias Epsilon = Scalar
    public func magnitude() -> Scalar { Scalar.length(self) }
    public func magnitudeSquared() -> Scalar { Scalar.lengthSquared(self) }
}

extension SIMD32: SIMDRepresentable, ApproximatelyEquatable, AnimatableVector,
    Comparable where Scalar: AnimatableScalar {
    public typealias SIMDType = Self
    public typealias Epsilon = Scalar
    public func magnitude() -> Scalar { Scalar.length(self) }
    public func magnitudeSquared() -> Scalar { Scalar.lengthSquared(self) }
}

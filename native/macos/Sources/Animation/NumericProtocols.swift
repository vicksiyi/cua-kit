// Recovered native descriptors: scalar 0x1012ce188, vector 0x1012ce278,
// representable 0x1012ce3a4. No concrete conformances are assumed here.
public protocol SIMDRepresentable: Equatable where SIMDType.SIMDType == SIMDType {
    associatedtype SIMDType: AnimatableVector = Self
    init(_ simdRepresentation: SIMDType)
    func simdRepresentation() -> SIMDType
    static var zero: Self { get }
}

public protocol AnimatableVector: ApproximatelyEquatable, SIMDRepresentable, SIMD
where Scalar: AnimatableScalar {
    func magnitude() -> Scalar
    func magnitudeSquared() -> Scalar
}

public protocol AnimatableScalar: ApproximatelyEquatable, SIMDRepresentable,
    BinaryFloatingPoint, Decodable, Encodable, SIMDScalar {
    static func length(_ value: SIMD2<Self>) -> Self
    static func length(_ value: SIMD3<Self>) -> Self
    static func length(_ value: SIMD4<Self>) -> Self
    static func length(_ value: SIMD8<Self>) -> Self
    static func length(_ value: SIMD16<Self>) -> Self
    static func lengthSquared(_ value: SIMD2<Self>) -> Self
    static func lengthSquared(_ value: SIMD3<Self>) -> Self
    static func lengthSquared(_ value: SIMD4<Self>) -> Self
    static func lengthSquared(_ value: SIMD8<Self>) -> Self
    static func lengthSquared(_ value: SIMD16<Self>) -> Self
    static func length(_ value: SIMD32<Self>) -> Self
    static func lengthSquared(_ value: SIMD32<Self>) -> Self
}

// Native 0x1007e4474 and 0x10038670c: identity conversion when already SIMD.
extension SIMDRepresentable where Self == SIMDType {
    public init(_ simdRepresentation: Self) { self = simdRepresentation }
    public func simdRepresentation() -> Self { self }
}

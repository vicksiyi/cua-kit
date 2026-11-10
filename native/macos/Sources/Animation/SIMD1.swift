// Native SIMD1 stores the standard scalar's two-lane storage, exposing one
// logical lane. Subscripts delegate to storage without an extra one-lane check.
public struct SIMD1<Scalar: SIMDScalar>: SIMD {
    public typealias MaskStorage = SIMD1<Scalar.SIMDMaskScalar>
    public var storage: Scalar.SIMD2Storage
    public var scalarCount: Int { 1 }

    public init() { storage = Scalar.SIMD2Storage() }
    public init(_ value: Scalar) {
        storage = Scalar.SIMD2Storage()
        storage[0] = value
    }
    public subscript(index: Int) -> Scalar {
        get { storage[index] }
        set { storage[index] = newValue }
    }
}

// Native 0x1007e448c/0x1007e4574 reads lane zero, uses Scalar.magnitude,
// and squares that magnitude for the squared result. Hidden storage is ignored.
extension SIMD1 where Scalar: AnimatableScalar {
    public func magnitude() -> Scalar { storage[0].magnitude }
    public func magnitudeSquared() -> Scalar {
        let value = storage[0].magnitude
        return value * value
    }
}

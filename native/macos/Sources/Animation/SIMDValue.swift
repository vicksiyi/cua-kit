// Native storage/accessors 0x1007e5038..0x1007e52f0. Store the SIMD
// representation; wrapped reads reconstruct Value rather than caching it.
@propertyWrapper
public struct SIMDValue<Value: SIMDRepresentable> {
    private var simdValue: Value.SIMDType

    public init(wrappedValue: Value) { simdValue = wrappedValue.simdRepresentation() }
    public init(simdValue: Value.SIMDType) { self.simdValue = simdValue }
    public init() { self.init(wrappedValue: .zero) }
    public static var zero: Self { Self() }
    public var wrappedValue: Value {
        get { Value(simdValue) }
        set { simdValue = newValue.simdRepresentation() }
    }
    public var projectedValue: Value.SIMDType {
        get { simdValue }
        set { simdValue = newValue }
    }
}

// Native comparisons reconstruct both wrapped values in left-to-right order.
// Equality of the underlying vector is not equivalent for custom Value types.
extension SIMDValue: Equatable {
    public static func == (lhs: Self, rhs: Self) -> Bool {
        let left = lhs.wrappedValue
        let right = rhs.wrappedValue
        return left == right
    }
}

extension SIMDValue: Comparable where Value: Comparable {
    public static func < (lhs: Self, rhs: Self) -> Bool {
        let left = lhs.wrappedValue
        let right = rhs.wrappedValue
        return left < right
    }
}

// Native uses a single-value container of Value, not a keyed vector payload.
// Both conformances are conditional on Value being Codable in the original.
extension SIMDValue: Codable where Value: Codable {
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        self.init(wrappedValue: try container.decode(Value.self))
    }
    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(wrappedValue)
    }
}

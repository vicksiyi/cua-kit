// AccessibilitySupport.TypeErasedArray, descriptor 0x1012cc42c.
// The original protocol has one associated type and no methods.
protocol TypeErasedArray {
    associatedtype ElementType
}

// Conformance descriptor 0x101193450 refers indirectly to Swift.Array ($sSaMn).
extension Array: TypeErasedArray {
    typealias ElementType = Element
}

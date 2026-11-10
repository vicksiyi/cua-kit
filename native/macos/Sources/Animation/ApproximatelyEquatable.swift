// Native protocol descriptor 0x1012ce2f0: Comparable base, Epsilon constrained
// to SIMDScalar, and one isAlmostEqual(to:tolerance:) requirement.
// Implementations deliberately remain with their concrete scalar/vector types.
public protocol ApproximatelyEquatable: Comparable {
    associatedtype Epsilon: SIMDScalar
    func isAlmostEqual(to other: Self, tolerance: Epsilon) -> Bool
}

extension AnimatableVector {
    // Native 0x1007e0ecc: lane-wise less-than, followed by all-mask reduction.
    public static func < (lhs: Self, rhs: Self) -> Bool { all(lhs .< rhs) }

    // Native 0x1007e03b0 uses generic Comparable.max on whole vectors.
    // Keep this ordering behavior; replacing it with per-lane abs would differ
    // for mixed-sign deltas. The final tolerance comparison is inclusive.
    public func isAlmostEqual(to other: Self, tolerance: Scalar) -> Bool {
        let delta = self - other
        let magnitude = Swift.max(delta, Self(repeating: 0) - delta)
        return all(magnitude .<= Self(repeating: tolerance))
    }
}

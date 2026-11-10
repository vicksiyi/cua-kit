extension FloatingPoint {
    // Native 0x1007ec6b4: strict relative bound, with least-normal scale floor.
    // There is no finite equality shortcut or added tolerance validation.
    public func isAlmostEqual(to other: Self, tolerance: Self) -> Bool {
        guard isFinite && other.isFinite else {
            return rescaledAlmostEqual(to: other, tolerance: tolerance)
        }
        let scale = Swift.max(Swift.abs(self), Swift.abs(other), Self.leastNormalMagnitude)
        return Swift.abs(self - other) < scale * tolerance
    }

    // Native 0x1007ec958: reject NaN, compare two infinities, otherwise halve
    // the finite operand and replace infinity by signed 2^maxExponent.
    private func rescaledAlmostEqual(to other: Self, tolerance: Self) -> Bool {
        if isNaN || other.isNaN { return false }
        if isInfinite {
            if other.isInfinite { return self == other }
            let scaledSelf = Self(sign: sign, exponent: Self.greatestFiniteMagnitude.exponent, significand: 1)
            let scaledOther = Self(sign: .plus, exponent: -1, significand: other)
            return scaledSelf.isAlmostEqual(to: scaledOther, tolerance: tolerance)
        }
        return other.rescaledAlmostEqual(to: self, tolerance: tolerance)
    }
}

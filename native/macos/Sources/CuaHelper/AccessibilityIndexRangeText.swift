// Numeric payload of the Rows/Columns helper at 0x100627b88. The caller
// supplies the label; the content-entry constructor/accumulator is separate.
func accessibilityIndexRangeText(_ range: ClosedRange<Int>?) -> String? {
    guard let range, range.lowerBound >= 0, range.lowerBound < range.upperBound else { return nil }
    return String(range.lowerBound) + "-" + String(range.upperBound)
}

// Native ComputerUseCore.AXArraySubsetDescriptor field reflection at 0x1012c9454.
// Ranges are Swift half-open Range<Int>; nil means no subset restriction.
struct AXArraySubsetDescriptor: Equatable {
    var count: Int
    var availableRanges: [Range<Int>]? = nil

    // Original getter 0x10045f8b4 compares the optional array pointer with zero.
    // Do not infer completeness from count, range coverage, or an empty array.
    var isComplete: Bool { availableRanges == nil }
}

// Native AccessibilitySupport.AXTruncationDescriptor reflection at 0x1012cc604.
struct AXTruncationDescriptor: Equatable {
    var count: Int
    var availableRange: Range<Int>? = nil
}

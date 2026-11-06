@main
struct AXValueDescriptorsTests {
    static func main() {
        precondition(AXArraySubsetDescriptor(count: 5).isComplete)
        precondition(AXArraySubsetDescriptor(count: 0).isComplete)
        precondition(!AXArraySubsetDescriptor(count: 0, availableRanges: []).isComplete)
        precondition(!AXArraySubsetDescriptor(count: 5, availableRanges: [0..<5]).isComplete)
        precondition(!AXArraySubsetDescriptor(count: 5, availableRanges: [0..<2, 2..<5]).isComplete)
        precondition(AXArraySubsetDescriptor(count: 5) != AXArraySubsetDescriptor(count: 5, availableRanges: []))
        precondition(AXArraySubsetDescriptor(count: 5, availableRanges: [0..<2, 2..<5]) != AXArraySubsetDescriptor(count: 5, availableRanges: [2..<5, 0..<2]))
        var subset = AXArraySubsetDescriptor(count: 5, availableRanges: [0..<2])
        subset.availableRanges = nil
        subset.count = 7
        precondition(subset == AXArraySubsetDescriptor(count: 7) && subset.isComplete)
        let fullText = AXTruncationDescriptor(count: 10)
        precondition(fullText.availableRange == nil)
        precondition(fullText != AXTruncationDescriptor(count: 10, availableRange: 0..<10))
        var text = AXTruncationDescriptor(count: 10, availableRange: 2..<7)
        precondition(text.availableRange!.contains(6) && !text.availableRange!.contains(7))
        text.availableRange = nil
        precondition(text == fullText)
        print("12 native AX descriptor cases passed")
    }
}

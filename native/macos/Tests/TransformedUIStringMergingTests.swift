import Foundation

@main
struct TransformedUIStringMergingTests {
    static func main() {
        let url = URL(string: "https://example.invalid")!
        for leftMapped in [false, true] { for rightMapped in [false, true] {
            var spans: [TransformedUIStringSpan] = [.string("😀")]
            var offsets: [Int?]? = leftMapped ? [10, 11] : nil
            let incoming: [TransformedUIStringSpan] = [.string("A"), .url("B", url: url, isImage: false), .string("e\u{301}")]
            let incomingOffsets: [Int?]? = rightMapped ? [50, nil, 80, 81] : nil
            mergeTransformedUIString(incomingSpans: incoming, incomingOffsets: incomingOffsets,
                spans: &spans, sourceOffsets: &offsets)
            precondition(transformedUIStringDescription(spans: spans) == "😀ABe\u{301}" && spans.count == 3)
            if leftMapped || rightMapped {
                let expected: [Int?] = (leftMapped ? [10, 11] : [nil, nil])
                    + (rightMapped ? [50, nil, 80, 81] : [nil, nil, nil, nil])
                precondition(offsets! == expected)
            } else { precondition(offsets == nil) }
            // Input is a value snapshot, unchanged by merging.
            precondition(incoming.count == 3 && transformedUIStringDescription(spans: incoming) == "ABe\u{301}")
        } }
        var spans: [TransformedUIStringSpan] = [.string("old")]
        var offsets: [Int?]? = nil
        mergeTransformedUIString(incomingSpans: [], incomingOffsets: [], spans: &spans, sourceOffsets: &offsets)
        precondition(offsets! == [nil, nil, nil] && spans.count == 1)
        // Source takes prefix(oldLength) after ordinary append. Preserve this
        // exact behavior even for inconsistent preexisting arrays.
        spans = [.string("AB")]; offsets = [9]
        mergeTransformedUIString(incomingSpans: [.string("C")], incomingOffsets: [20], spans: &spans, sourceOffsets: &offsets)
        precondition(offsets! == [9, nil, 20])
        spans = [.string("AB")]; offsets = [1, 2, 99]
        mergeTransformedUIString(incomingSpans: [], incomingOffsets: [], spans: &spans, sourceOffsets: &offsets)
        precondition(offsets! == [1, 2])
        spans = [.string("a")]; offsets = [4]
        mergeTransformedUIString(incomingSpans: spans, incomingOffsets: offsets, spans: &spans, sourceOffsets: &offsets)
        precondition(transformedUIStringDescription(spans: spans) == "aa" && offsets! == [4, 4])
        print("interpolation merge preserves mapping combinations, UTF16 prefixes, span boundaries and self append")
    }
}

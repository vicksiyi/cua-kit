import Foundation

@main
struct TransformedUIStringAppendingTests {
    static func main() {
        var spans: [TransformedUIStringSpan] = [.string("old")]
        var offsets: [Int?]? = nil
        if CommandLine.arguments.contains("invalid") {
            appendMappedTransformedUIString("😀", offsets: [1], spans: &spans, sourceOffsets: &offsets)
            fatalError("must trap before returning")
        }
        appendTransformedUIStringSpan(.string("😀"), spans: &spans, sourceOffsets: &offsets)
        precondition(spans.count == 1 && offsets == nil)
        appendMappedTransformedUIString("e\u{301}", offsets: [10, nil], spans: &spans, sourceOffsets: &offsets)
        precondition(spans.count == 1 && offsets! == [nil, nil, nil, nil, nil, 10, nil])
        let url = URL(string: "https://example.invalid")!
        appendTransformedUIStringSpan(.url("👩🏽‍💻", url: url, isImage: true), spans: &spans, sourceOffsets: &offsets)
        precondition(spans.count == 2 && offsets!.count == 14)
        precondition(Array(offsets!.suffix(7)) == Array(repeating: nil, count: 7))
        appendMappedTransformedUIString("A", offsets: [-4], spans: &spans, sourceOffsets: &offsets)
        precondition(spans.count == 3 && offsets!.last! == -4)
        appendMappedTransformedUIString("B", offsets: [100], spans: &spans, sourceOffsets: &offsets)
        precondition(spans.count == 3 && Array(offsets!.suffix(2)) == [-4, 100])
        precondition(transformedUIStringDescription(spans: spans) == "old😀e\u{301}👩🏽‍💻AB")
        if case .url(_, let retained, let image) = spans[1] { precondition(retained == url && image) }
        else { fatalError("URL span must not coalesce") }
        // Empty mapped append activates a nonnil mapping, even with no text.
        spans = []; offsets = nil
        appendMappedTransformedUIString("", offsets: [], spans: &spans, sourceOffsets: &offsets)
        precondition(spans.count == 1 && offsets != nil && offsets!.isEmpty)
        appendTransformedUIStringSpan(.string("x"), spans: &spans, sourceOffsets: &offsets)
        precondition(spans.count == 1 && offsets! == [nil])
        // Value semantics: modifying the result must not mutate snapshots.
        let savedSpans = spans, savedOffsets = offsets
        appendMappedTransformedUIString("y", offsets: [3], spans: &spans, sourceOffsets: &offsets)
        precondition(transformedUIStringDescription(spans: savedSpans) == "x" && savedOffsets! == [nil])
        print("span append preserves UTF16 mapping, merge boundaries, nil distinction and value semantics")
    }
}

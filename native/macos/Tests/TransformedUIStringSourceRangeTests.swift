import Foundation

@main
struct TransformedUIStringSourceRangeTests {
    static func main() {
        if CommandLine.arguments.contains("input-overflow") {
            _ = transformedUIStringSourceRange(forMarkdownRange: NSRange(location: Int.max - 1, length: 2), sourceOffsets: [])
            fatalError("expected checked input overflow")
        }
        if CommandLine.arguments.contains("output-overflow") {
            _ = transformedUIStringSourceRange(forMarkdownRange: NSRange(location: 0, length: 2), sourceOffsets: [Int.min, Int.max])
            fatalError("expected checked result overflow")
        }
        func check(_ range: NSRange, _ offsets: [Int?]?, _ expected: NSRange?) {
            precondition(transformedUIStringSourceRange(forMarkdownRange: range, sourceOffsets: offsets) == expected)
        }
        check(NSRange(location: Int.max - 1, length: 2), nil, nil) // absence before arithmetic
        check(NSRange(location: NSNotFound, length: 1), [3], nil)
        check(NSRange(location: -1, length: 1), [3], nil)
        check(NSRange(location: 0, length: -1), [3], nil)
        check(NSRange(location: 1, length: 1), [3], nil)
        check(NSRange(location: 1, length: 0), [3], nil)
        check(NSRange(location: 0, length: 0), [], nil)
        check(NSRange(location: 0, length: 2), [nil, nil], nil)
        check(NSRange(location: 0, length: 5), [nil, 10, nil, 14, nil], NSRange(location: 10, length: 5))
        check(NSRange(location: 1, length: 2), [20, nil, 42, 50], NSRange(location: 42, length: 1))
        check(NSRange(location: 0, length: 3), [10, 100, 12], NSRange(location: 10, length: 3)) // not min/max
        check(NSRange(location: 0, length: 2), [10, 3], NSRange(location: 10, length: -6)) // no sort/clamp
        var spans: [TransformedUIStringSpan] = [.string("prefix😀")]
        var offsets: [Int?]? = nil
        appendMappedTransformedUIString("e\u{301}😀", offsets: [30, 31, 32, 33], spans: &spans, sourceOffsets: &offsets)
        check(NSRange(location: 8, length: 4), offsets, NSRange(location: 30, length: 4))
        check(NSRange(location: 6, length: 4), offsets, NSRange(location: 30, length: 2))
        print("source range preserves validation order, nil compaction, endpoint semantics and UTF16 integration")
    }
}

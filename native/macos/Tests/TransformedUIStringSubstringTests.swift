import Foundation

@main
struct TransformedUIStringSubstringTests {
    static func main() {
        func ranges(_ text: String, _ needle: String, _ prefix: String? = nil, _ suffix: String? = nil) -> [NSRange] {
            transformedUIStringMarkdownRanges(of: needle, prefix: prefix, suffix: suffix, spans: [.string(text)])
        }
        precondition(ranges("aaa", "aa") == [NSRange(location: 0, length: 2), NSRange(location: 1, length: 2)])
        precondition(ranges("abc", "").isEmpty && ranges("", "a").isEmpty)
        precondition(ranges("ABC", "a").isEmpty)
        precondition(ranges("xfoo! yfoo?", "foo", "y", "?") == [NSRange(location: 7, length: 3)])
        precondition(ranges("xfoo!", "foo", "x ", nil).isEmpty)
        precondition(ranges("foo", "foo", "x", nil).isEmpty)
        precondition(ranges("foo", "foo", nil, "!").isEmpty)
        precondition(ranges("foo", "foo", "", "") == [NSRange(location: 0, length: 3)])
        precondition(ranges("😀foo😀", "foo", "😀", "😀") == [NSRange(location: 2, length: 3)])
        let url = URL(string: "https://example.invalid")!
        let spans: [TransformedUIStringSpan] = [.string("ab"), .url("cd", url: url, isImage: false)]
        precondition(transformedUIStringMarkdownRanges(of: "bc", prefix: "a", suffix: "d", spans: spans) == [NSRange(location: 1, length: 2)])
        precondition(transformedUIStringSourceRange(ofMarkdownSubstring: "bc", prefix: nil, suffix: nil, spans: spans, sourceOffsets: [10, 11, 12, 13]) == NSRange(location: 11, length: 2))
        precondition(transformedUIStringSourceRange(ofMarkdownSubstring: "aa", prefix: nil, suffix: nil, spans: [.string("aaa")], sourceOffsets: [10, nil, nil]) == nil)
        precondition(transformedUIStringSourceRange(ofMarkdownSubstring: "bc", prefix: nil, suffix: nil, spans: spans, sourceOffsets: nil) == nil)
        // NSString search without .literal supports canonical equivalence.
        precondition(ranges("e\u{301}", "é") == [NSRange(location: 0, length: 2)])
        print("substring search preserves overlaps, context, UTF16 and ambiguity before mapping")
    }
}

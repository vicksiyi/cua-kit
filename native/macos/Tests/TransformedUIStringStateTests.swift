import Foundation

@main
struct TransformedUIStringStateTests {
    static func main() {
        let url = URL(string: "https://example.invalid")!
        precondition(transformedUIStringIsEmpty(spans: []))
        precondition(transformedUIStringLast(spans: []) == nil)
        for linked in [false, true] {
            func span(_ text: String) -> TransformedUIStringSpan {
                linked ? .url(text, url: url, isImage: true) : .string(text)
            }
            precondition(transformedUIStringIsEmpty(spans: [span("")]))
            precondition(!transformedUIStringIsEmpty(spans: [span(" ")]))
            let emptyPair = [span(""), span("")]
            precondition(transformedUIStringDescription(spans: emptyPair).isEmpty)
            precondition(!transformedUIStringIsEmpty(spans: emptyPair))
            precondition(transformedUIStringLast(spans: [.string("earlier"), span("")]) == nil)
            for text in ["a", "😀", "e\u{301}", "👩🏽‍💻", "🇨🇳"] {
                var spans: [TransformedUIStringSpan] = [.string("earlier"), span(text)]
                precondition(transformedUIStringLast(spans: spans) == Character(text))
                var offsets: [Int?]? = nil
                removeLastTransformedUIStringCharacter(spans: &spans, sourceOffsets: &offsets)
                precondition(transformedUIStringLast(spans: spans) == nil)
                precondition(!transformedUIStringIsEmpty(spans: spans))
            }
            // Combining marks and regional indicators combine across a join,
            // but the getter preserves each span's independent Character boundary.
            for (head, tail) in [("e", "\u{301}"), ("🇨", "🇳")] {
                let spans: [TransformedUIStringSpan] = [.string(head), span(tail)]
                precondition(transformedUIStringLast(spans: spans) == Character(tail))
                precondition(transformedUIStringLast(spans: spans) != transformedUIStringDescription(spans: spans).last)
            }
        }
        print("state getters preserve structural emptiness, empty tails and span-local graphemes")
    }
}

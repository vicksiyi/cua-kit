import Foundation

@main
struct TransformedUIStringMarkdownLinkTests {
    static func main() {
        let url = URL(string: "https://example.invalid/a")!
        let choices: [String?] = [nil, "", " \n", " [x] "]
        for value in choices { for title in choices { for description in choices {
            for image in [false, true] { for mapped in [false, true] {
                var spans: [TransformedUIStringSpan] = [.string("😀")]
                var offsets: [Int?]? = mapped ? [20, 21] : nil
                var calls = 0
                appendTransformedUIStringMarkdownLink(url: url, isImage: image,
                    stringValue: value, title: title, description: description,
                    trimURL: { original, isImage in
                        precondition(original == url && isImage == image)
                        calls += 1
                        return "short"
                    }, spans: &spans, sourceOffsets: &offsets)
                let selected = [value, title, description].compactMap { $0 }.first { !$0.isEmpty }
                let expected: String
                if selected == nil { expected = "😀<short>" }
                else if selected == " \n" { expected = "😀[](short)" }
                else { expected = "😀[\\[x\\]](short)" }
                precondition(transformedUIStringDescription(spans: spans) == expected && calls == 1)
                precondition(spans.count == 3)
                guard case .url(let text, let original, let isImage) = spans[1] else { fatalError("URL boundary lost") }
                precondition(text == "short" && original == url && isImage == image)
                if mapped {
                    precondition(offsets! == [20, 21] + Array<Int?>(repeating: nil, count: expected.utf16.count - 2))
                } else { precondition(offsets == nil) }
            } }
        } } }
        var spans: [TransformedUIStringSpan] = []
        var offsets: [Int?]? = nil
        appendTransformedUIStringMarkdownLink(url: url, isImage: true, stringValue: nil, title: nil, description: nil,
            trimURL: { _, _ in nil }, spans: &spans, sourceOffsets: &offsets)
        precondition(transformedUIStringDescription(spans: spans) == "<>" && spans.count == 3)
        print("Markdown links preserve label precedence, escaping, trimming, URL boundaries and source mapping")
    }
}

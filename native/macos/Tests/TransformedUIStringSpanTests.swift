import Foundation

@main
struct TransformedUIStringSpanTests {
    static func main() {
        let url = URL(string: "https://example.invalid/unused")!
        precondition(transformedUIStringDescription(spans: []) == "")
        precondition(transformedUIStringDescription(spans: [.string("")]) == "")
        let spans: [TransformedUIStringSpan] = [
            .string("前缀 "), .url("[链接](short)", url: url, isImage: false),
            .string("\n"), .url("![图](image)", url: url, isImage: true),
            .string("e\u{301}👩🏽‍💻"), .url("", url: url, isImage: true),
        ]
        precondition(transformedUIStringDescription(spans: spans) == "前缀 [链接](short)\n![图](image)e\u{301}👩🏽‍💻")
        for image in [false, true] {
            precondition(transformedUIStringDescription(spans: [.url("unchanged", url: url, isImage: image)]) == "unchanged")
        }
        if case .url(let text, let originalURL, let image) = spans[3] {
            precondition(text == "![图](image)" && originalURL == url && image)
        } else { fatalError("URL payload lost") }
        print("transformed string description preserves span text, ordering, Unicode and URL metadata")
    }
}

import Foundation

@main
struct TransformedUIStringRemovalTests {
    static func main() {
        let url = URL(string: "https://example.invalid")!
        if CommandLine.arguments.contains("empty-tail") {
            var spans: [TransformedUIStringSpan] = [.string("earlier"), .url("", url: url, isImage: true)]
            var offsets: [Int?]? = nil
            removeLastTransformedUIStringCharacter(spans: &spans, sourceOffsets: &offsets)
            fatalError("empty final span must trap")
        }
        if CommandLine.arguments.contains("short-mapping") {
            var spans: [TransformedUIStringSpan] = [.string("😀")]
            var offsets: [Int?]? = [1]
            removeLastTransformedUIStringCharacter(spans: &spans, sourceOffsets: &offsets)
            fatalError("mapping shorter than removed UTF16 length must trap")
        }
        for character in ["a", "😀", "e\u{301}", "👩🏽‍💻", "🇨🇳"] {
            for linked in [false, true] { for mapped in [false, true] {
                var spans: [TransformedUIStringSpan] = [.string("left"), linked
                    ? .url("x" + character, url: url, isImage: true) : .string("x" + character)]
                let saved = spans
                var offsets: [Int?]? = mapped ? Array(0..<(5 + character.utf16.count)).map(Optional.some) : nil
                removeLastTransformedUIStringCharacter(spans: &spans, sourceOffsets: &offsets)
                precondition(spans.count == 2 && transformedUIStringDescription(spans: spans) == "leftx")
                precondition(transformedUIStringDescription(spans: saved) == "leftx" + character)
                precondition(mapped ? offsets! == [0, 1, 2, 3, 4] : offsets == nil)
                if linked {
                    guard case .url(let text, let original, let image) = spans[1] else { fatalError("lost URL case") }
                    precondition(text == "x" && original == url && image)
                }
                removeLastTransformedUIStringCharacter(spans: &spans, sourceOffsets: &offsets)
                precondition(spans.count == 2 && transformedUIStringDescription(spans: spans) == "left")
            } }
        }
        var spans: [TransformedUIStringSpan] = []
        var offsets: [Int?]? = [12]
        removeLastTransformedUIStringCharacter(spans: &spans, sourceOffsets: &offsets)
        precondition(spans.isEmpty && offsets! == [12])
        print("removeLast preserves grapheme deletion, UTF16 trimming, URL payloads and empty-span boundaries")
    }
}

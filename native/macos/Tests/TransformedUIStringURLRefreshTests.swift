import Foundation

@main
struct TransformedUIStringURLRefreshTests {
    static func main() {
        let first = URL(string: "https://example.invalid/a")!
        let second = URL(string: "https://example.invalid/b")!
        var spans: [TransformedUIStringSpan] = [.string("plain"), .url("old", url: first, isImage: false), .url("", url: second, isImage: true)]
        let snapshot = spans
        var seen: [(URL, Bool)] = []
        let changed = refreshTransformedUIStringURLs(spans: &spans) { url, image in
            seen.append((url, image))
            return url == first ? "😀longer" : nil
        }
        precondition(changed && seen.count == 2)
        precondition(seen[0].0 == first && !seen[0].1 && seen[1].0 == second && seen[1].1)
        precondition(spans.count == 3 && transformedUIStringDescription(spans: spans) == "plain😀longer")
        precondition(transformedUIStringDescription(spans: snapshot) == "plainold")
        guard case .url(_, let retained, let image) = spans[2] else { fatalError("lost URL span") }
        precondition(retained == second && image)
        precondition(!refreshTransformedUIStringURLs(spans: &spans) { url, _ in url == first ? "😀longer" : nil })
        precondition(refreshTransformedUIStringURLs(spans: &spans) { _, _ in nil })
        precondition(transformedUIStringDescription(spans: spans) == "plain" && spans.count == 3)
        var plain: [TransformedUIStringSpan] = [.string("text")]
        precondition(!refreshTransformedUIStringURLs(spans: &plain) { _, _ in fatalError("plain text must not call shortener") })
        var empty: [TransformedUIStringSpan] = []
        precondition(!refreshTransformedUIStringURLs(spans: &empty) { _, _ in fatalError("empty must not call shortener") })
        var equivalent: [TransformedUIStringSpan] = [.url("e\u{301}", url: first, isImage: false)]
        precondition(!refreshTransformedUIStringURLs(spans: &equivalent) { _, _ in "é" })
        // Equal text is not replaced, preserving the existing scalar encoding.
        precondition(Array(transformedUIStringDescription(spans: equivalent).unicodeScalars).count == 2)
        print("URL refresh preserves call order, metadata, nil conversion and canonical equality")
    }
}

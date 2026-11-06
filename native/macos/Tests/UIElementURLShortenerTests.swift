import Foundation

@main
struct UIElementURLShortenerTests {
    static func main() {
        func config(_ individual: Int? = nil, _ total: Int? = nil,
                    _ query: Bool = true, _ fragment: Bool = true) -> UIElementURLShortener.Configuration {
            .init(individualLimit: individual, totalLimit: total, includeQuery: query, includeFragment: fragment, baseHost: nil)
        }
        let url = URL(string: "https://example.invalid")!
        var shortener = UIElementURLShortener(configuration: config(nil, 15))
        precondition(shortener.trim(url: url, isImage: false) == "example.invalid")
        let snapshot = shortener
        precondition(shortener.trim(url: url, isImage: false) == "…")
        precondition(shortener.compactConfigurationIfNeeded() == 15) // unique, not twice
        precondition(shortener.trim(url: url, isImage: false) == "…") // accumulated not reset
        shortener.reset()
        precondition(shortener.configuration == snapshot.configuration)
        precondition(shortener.compactConfigurationIfNeeded() == 0)
        precondition(shortener.trim(url: url, isImage: false) == "example.invalid")
        var empty = UIElementURLShortener(configuration: config())
        precondition(empty.compactConfigurationIfNeeded() == 0 && empty.configuration.totalLimit == 4000)
        var image = UIElementURLShortener(configuration: config(nil, 15))
        precondition(image.trim(url: url, isImage: true) == nil)
        precondition(image.compactConfigurationIfNeeded() == 15) // recorded before suppression
        var blocked = UIElementURLShortener(configuration: config(nil, 0))
        _ = blocked.trim(url: url, isImage: false)
        precondition(blocked.compactConfigurationIfNeeded() == 1)
        precondition(blocked.configuration.individualLimit == 20)
        precondition(!blocked.configuration.includeQuery && !blocked.configuration.includeFragment)
        var small = UIElementURLShortener(configuration: config(5, 0, false, false))
        _ = small.trim(url: url, isImage: false)
        precondition(small.compactConfigurationIfNeeded() == 1 && small.configuration.individualLimit == 5)
        // Repeatedly shorten, preserve shared value snapshots, then refresh spans.
        var original = snapshot
        precondition(original.trim(url: url, isImage: false) == "…")
        var spans: [TransformedUIStringSpan] = [.url("old", url: url, isImage: false)]
        shortener.reset()
        precondition(refreshTransformedUIStringURLs(spans: &spans) { shortener.trim(url: $0, isImage: $1) })
        precondition(transformedUIStringDescription(spans: spans) == "example.invalid")
        print("stateful shortener preserves unique remeasurement, reset, image tracking and compaction floor")
    }
}

import Foundation

@main
struct UIElementURLShortenerCoreTests {
    static func main() {
        func config(_ individual: Int? = nil, _ total: Int? = nil,
                    _ query: Bool = true, _ fragment: Bool = true) -> UIElementURLShortenerConfiguration {
            .init(individualLimit: individual, totalLimit: total, includeQuery: query, includeFragment: fragment, baseHost: nil)
        }
        if CommandLine.arguments.contains("overflow") {
            var accumulated = 0
            _ = trimUIElementURL(URL(string: "https://example.invalid")!, isImage: false,
                configuration: config(Int.max), accumulated: &accumulated)
            fatalError("checked limit + 1 must trap")
        }
        var accumulated = 7
        for text in ["data:text/plain,hello", "WEBDOC://example.invalid", "relative/path"] {
            let result = trimUIElementURL(URL(string: text)!, isImage: false, configuration: config(), accumulated: &accumulated)
            precondition(result.text == nil && result.domain == nil && accumulated == 7)
        }
        let url = URL(string: "https://www.example.invalid/path?q=1#part")!
        precondition(trimUIElementURL(url, isImage: true, configuration: config(), accumulated: &accumulated).text == nil)
        precondition(accumulated == 7)
        for query in [false, true] { for fragment in [false, true] {
            accumulated = 0
            let result = trimUIElementURL(url, isImage: false, configuration: config(nil, nil, query, fragment), accumulated: &accumulated)
            let expected = "example.invalid/path" + (query ? "?q=1" : "") + (fragment ? "#part" : "")
            precondition(result.domain == "example.invalid" && result.text == expected && accumulated == expected.count)
        } }
        let file = URL(fileURLWithPath: "/tmp/test file")
        accumulated = 42
        let fileResult = trimUIElementURL(file, isImage: false, configuration: config(1, 0, false, false), accumulated: &accumulated)
        precondition(fileResult.domain == nil && fileResult.text == file.absoluteString && accumulated == 42)
        let plain = URL(string: "https://example.invalid")!
        for limit in [1, 3, 14, 15, 16] {
            accumulated = 0
            let result = trimUIElementURL(plain, isImage: false, configuration: config(limit), accumulated: &accumulated)
            let expected = limit < 15 ? String("example.invalid".prefix(limit - 1)) + "…" : "example.invalid"
            precondition(result.text == expected && accumulated == expected.count)
        }
        accumulated = 0
        let budget = config(nil, 15)
        precondition(trimUIElementURL(plain, isImage: false, configuration: budget, accumulated: &accumulated).text == "example.invalid")
        precondition(accumulated == 15)
        let exhausted = trimUIElementURL(plain, isImage: false, configuration: budget, accumulated: &accumulated)
        precondition(exhausted.text == "…" && exhausted.domain == "example.invalid" && accumulated == 16)
        _ = trimUIElementURL(plain, isImage: false, configuration: budget, accumulated: &accumulated)
        precondition(accumulated == 17) // Replacement still consumes budget past the limit.
        print("URL core preserves scheme gates, image suppression, file bypass, rewriting and cumulative budgets")
    }
}

import Foundation

@main
struct UIElementURLRenderingPassTests {
    struct Context {
        var shortener = UIElementURLShortener(configuration: .init(individualLimit: nil,
            totalLimit: 15, includeQuery: true, includeFragment: true, baseHost: nil))
        var calls = 0
    }
    enum Failure: Error { case expected }
    static func main() throws {
        let url = URL(string: "https://example.invalid")!
        var context = Context()
        _ = context.shortener.trim(url: url, isImage: false) // dirty state must be reset first
        var total = 4
        let result = withUIElementURLRenderingPass(context: &context, shortener: \.shortener, totalLength: &total) { context in
            context.calls += 1
            return context.shortener.trim(url: url, isImage: false)
        }
        precondition(result == "example.invalid" && total == 19 && context.calls == 1)
        precondition(context.shortener.trim(url: url, isImage: false) == "example.invalid") // final reset
        context = Context()
        total = 9
        do {
            try withUIElementURLRenderingPass(context: &context, shortener: \.shortener, totalLength: &total) { context in
                context.calls += 1
                _ = context.shortener.trim(url: url, isImage: false)
                throw Failure.expected
            }
            fatalError("must propagate body error")
        } catch Failure.expected {}
        precondition(total == 9 && context.calls == 1)
        precondition(context.shortener.trim(url: url, isImage: false) == "…") // no final reset on error
        context.shortener.configuration.totalLimit = 0
        total = 0
        let firstPass = withUIElementURLRenderingPass(context: &context, shortener: \.shortener, totalLength: &total) { context in
            context.calls += 1
            _ = context.shortener.trim(url: url, isImage: false)
            return context.shortener.configuration.includeFragment
        }
        precondition(firstPass && context.calls == 2) // result predates compaction; no rerender
        precondition(total == 1 && !context.shortener.configuration.includeFragment)
        precondition(context.shortener.configuration.individualLimit == 20)
        precondition(context.shortener.compactConfigurationIfNeeded() == 0)
        print("URL rendering pass preserves single execution, success reset and throwing state")
    }
}

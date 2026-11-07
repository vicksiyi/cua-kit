import Foundation
import CoreGraphics

@main
struct UIElementTransformationContextTests {
    static func main() {
        let bounds = CGRect(x: -12, y: 30, width: 640, height: 480)
        var cases = 0
        for type in UIElementContextType.allCases {
            for application: Int? in [nil, 1] { for window: Int? in [nil, 2] {
                for catalyst in [false, true] { for first in [false, true] { for second in [false, true] {
                    for chromium in [false, true] { for framePresent in [false, true] {
                        var events: [String] = []
                        var webReads = 0
                        var context = UIElementTransformationContext(type: type, application: application, window: window,
                            urlConfiguration: nil,
                            isCatalystApp: { value in precondition(value == 1); events.append("catalyst"); return catalyst },
                            applicationIsWebShaped: { _ in events.append("web"); webReads += 1; return webReads == 1 ? first : second },
                            windowHasChromeNode: { value in precondition(value == 2); events.append("chrome"); return chromium },
                            frame: { _ in events.append("frame"); return framePresent ? bounds : nil })
                        let probe = application != nil && second && window != nil
                        precondition(context.type == type)
                        precondition(context.isCatalyst == (application != nil && catalyst))
                        precondition(context.isWebShaped == (application != nil && first))
                        precondition(context.isChromium == (probe && chromium))
                        precondition(context.windowFrame == (window != nil && framePresent ? bounds : nil))
                        precondition(events == ((application == nil ? [] : ["catalyst", "web", "web"]) + (probe ? ["chrome"] : []) + (window == nil ? [] : ["frame"])))
                        precondition(context.urlShortener.configuration == .init(individualLimit: nil, totalLimit: nil,
                            includeQuery: true, includeFragment: true, baseHost: nil))
                        // Compose actual URL state with the recovered context, not a mock shortener.
                        var total = 3
                        let output = context.shortenURLsIfNeeded(totalLength: &total) {
                            $0.urlShortener.trim(url: URL(string: "https://example.com/a?q=1#f")!, isImage: false)
                        }
                        precondition(output == "example.com/a?q=1#f" && total == 3 + output!.count)
                        precondition(context.urlShortener.configuration.totalLimit == 4000)
                        cases += 1
                    } }
                } } }
            } }
        }
        let config = UIElementURLShortener.Configuration(individualLimit: 29, totalLimit: 83,
            includeQuery: false, includeFragment: false, baseHost: nil)
        var context = UIElementTransformationContext(type: .fullUIContext,
            application: Optional<Int>.none, window: Optional<Int>.none, urlConfiguration: config,
            isCatalystApp: { _ in fatalError() }, applicationIsWebShaped: { _ in fatalError() },
            windowHasChromeNode: { _ in fatalError() }, frame: { _ in fatalError() })
        precondition(context.urlShortener.configuration == config)
        enum ProbeError: Error { case expected }
        var callbackCount = 0
        var totalLength = 17
        do {
            let _: Int = try context.shortenURLsIfNeeded(totalLength: &totalLength) { value in
                callbackCount += 1
                _ = value.urlShortener.trim(url: URL(string: "https://example.com/a")!, isImage: false)
                throw ProbeError.expected
            }
            preconditionFailure("expected callback error")
        } catch ProbeError.expected {} catch { preconditionFailure("unexpected error") }
        precondition(callbackCount == 1 && totalLength == 17)
        precondition(context.urlShortener.configuration == config)
        precondition(context.urlShortener.compactConfigurationIfNeeded() > 0,
            "throw must preserve URLs collected before failure")
        print("transformation context preserves repeated reads, window gating and URL state: \(cases) cases")
    }
}

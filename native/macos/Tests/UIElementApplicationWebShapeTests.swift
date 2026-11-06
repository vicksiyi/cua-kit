import Foundation

@main
struct UIElementApplicationWebShapeTests {
    enum Failure: Error { case expected }
    static func main() {
        let url = URL(fileURLWithPath: "/fixture.app")
        for failure in 0...4 {
            var calls: [String] = []
            let result = uiElementApplicationIsWebShaped(
                processID: { calls.append("pid"); if failure == 0 { throw Failure.expected }; return 42 },
                runningApplication: { pid -> Int? in precondition(pid == 42); calls.append("app"); return failure == 1 ? nil : 1 },
                bundleURL: { _ in calls.append("url"); return failure == 2 ? nil : url },
                loadBundle: { path -> Int? in precondition(path == url); calls.append("bundle"); return failure == 3 ? nil : 2 },
                supportsHTTP: { _ in calls.append("http"); return true },
                isElectron: { _ in fatalError("HTTP must short circuit") },
                isChromium: { _ in fatalError("HTTP must short circuit") })
            precondition(result == (failure == 4))
            precondition(calls == Array(["pid", "app", "url", "bundle", "http"].prefix(failure + 1)))
        }
        for http in [false, true] { for electron in [false, true] { for chromium in [false, true] {
            var calls: [String] = []
            let result = uiElementApplicationIsWebShaped(processID: { 0 }, runningApplication: { _ in 1 },
                bundleURL: { _ in url }, loadBundle: { _ in 1 },
                supportsHTTP: { _ in calls.append("http"); return http },
                isElectron: { _ in calls.append("electron"); return electron },
                isChromium: { _ in calls.append("chromium"); return chromium })
            precondition(result == (http || electron || chromium))
            precondition(calls == (http ? ["http"] : electron ? ["http", "electron"] : ["http", "electron", "chromium"]))
        } } }
        print("application classification preserves resolution failures and ordered bundle predicates")
    }
}

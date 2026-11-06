import Foundation

@main
struct UIElementInsideWebViewTests {
    static func main() {
        // The parent sequence reads one node ahead even on a matching node.
        for match in [0, 1, 299, 300, 301, -1] {
            var parents: [Int] = [], roles: [Int] = [], bundles: [Int] = []
            let result = uiElementIsInsideWebView(0, parent: {
                parents.append($0); return $0 + 1
            }, role: {
                roles.append($0); return $0 == match ? .webArea : .button
            }, bundleIdentifier: {
                bundles.append($0); return nil
            })
            let matches = (0...300).contains(match)
            precondition(result == matches)
            let last = matches ? match : 300
            precondition(parents == Array(0...last) && roles == Array(0...last))
            precondition(bundles == (matches ? [] : [0]))
        }
        // Exhaustion without a WebArea consults exactly the original element.
        let identifiers: [(String?, Bool)] = [
            (nil, false), ("", false), ("com.openai.atlas", true),
            ("com.openai.atlas.beta", true), ("com.openai.atlasOther", true),
            ("COM.OPENAI.ATLAS", false), ("xcom.openai.atlas", false),
            ("com.openai.atla", false), ("com.google.Chrome", false),
        ]
        for (identifier, expected) in identifiers {
            var trace: [String] = []
            let result = uiElementIsInsideWebView(10, parent: {
                trace.append("parent:\($0)"); return $0 == 10 ? 11 : nil
            }, role: {
                trace.append("role:\($0)"); return .unknown
            }, bundleIdentifier: {
                precondition($0 == 10); trace.append("bundle:\($0)"); return identifier
            })
            precondition(result == expected)
            precondition(trace == ["parent:10", "role:10", "parent:11", "role:11", "bundle:10"])
        }
        var count = 0, bundleCount = 0
        let cycle = uiElementIsInsideWebView(7, parent: { $0 }, role: { _ in
            count += 1; return .unknown
        }, bundleIdentifier: { original in
            precondition(original == 7); bundleCount += 1; return "com.openai.atlas"
        })
        precondition(cycle && count == 301 && bundleCount == 1)
        let selfOnly = uiElementIsInsideWebView(0, parent: { _ in nil }, role: { _ in .webArea },
            bundleIdentifier: { _ in fatalError("WebArea must skip bundle lookup") })
        precondition(selfOnly)
        print("web-view classification preserves self, depth, lookahead, cycles and lazy prefix fallback")
    }
}

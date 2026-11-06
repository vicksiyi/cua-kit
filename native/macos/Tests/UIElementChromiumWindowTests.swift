import Foundation

@main
struct UIElementChromiumWindowTests {
    enum Failure: Error { case expected }
    static func main() {
        precondition(UIElementAttribute.chromeNodeID == UIElementAttribute("ChromeAXNodeId"))
        for children: [Int]? in [nil, [], [1], [1, 2]] {
            for supported in [false, true] {
                var reads = 0
                var inspected: [Int] = []
                let result = uiElementWindowHasChromeNode(readChildren: { index, maxValues, count in
                    precondition(index == 0 && maxValues == 1 && count == nil)
                    reads += 1
                    return children
                }, supportedAttributes: { child in
                    inspected.append(child)
                    return supported ? [.chromeNodeID] : [UIElementAttribute("AXRole")]
                })
                let hasFirst = children?.first != nil
                precondition(result == (hasFirst && supported) && reads == 1)
                precondition(inspected == (hasFirst ? [1] : []))
            }
        }
        precondition(!uiElementWindowHasChromeNode(readChildren: { _, _, _ -> [Int]? in throw Failure.expected },
            supportedAttributes: { _ in fatalError("must not inspect after failed decode") }))
        precondition(!uiElementWindowHasChromeNode(readChildren: { _, _, _ in [1, 2] },
            supportedAttributes: { $0 == 2 ? [.chromeNodeID] : [] }))
        precondition(!uiElementWindowHasChromeNode(readChildren: { _, _, _ in [1] },
            supportedAttributes: { _ in [UIElementAttribute("chromeaxnodeid")] }))
        print("Chromium window probe preserves first-child limits, exact attribute and decode failure")
    }
}

import ApplicationServices

@main
struct UIElementAttributeSupportTests {
    static func main() {
        let target = UIElementAttribute("AXTitle")
        let other = UIElementAttribute("AXRole")
        let element = AXUIElementCreateApplication(424242)
        // Oracle from the independently decoded native branches. An absent
        // value alone must never establish unsupported status.
        let rows: [(Set<UIElementAttribute>, Set<UIElementAttribute>?, Bool, Int)] = [
            ([], nil, false, 2), ([other], nil, true, 3), ([target], nil, false, 3),
            ([], [], false, 1), ([other], [], false, 1), ([target], [], false, 1),
            ([], [other], false, 1), ([target], [other], false, 1),
            ([], [target], true, 2), ([other], [target], true, 2),
            ([target], [target], false, 2), ([target, other], [target], false, 2),
        ]
        for (supported, requested, expected, expectedReads) in rows {
            let cache = UIElementCache(supportedAttributes: supported, attributes: [:], transactionAttributes: requested)
            var reads = 0
            let actual = uiElementAttributeIsKnownUnsupported(target) { reads += 1; return cache }
            precondition(actual == expected && reads == expectedReads)
            precondition(UIElement(axElement: element, cache: cache).attributeIsKnownUnsupported(target) == expected)
        }
        // A protocol getter may change between calls. Do not eagerly snapshot
        // it or replace repeated reads with a single cached tuple.
        var reads = 0
        let result = uiElementAttributeIsKnownUnsupported(target) {
            reads += 1
            return UIElementCache(supportedAttributes: reads == 2 ? [target] : [], attributes: [:], transactionAttributes: nil)
        }
        precondition(result && reads == 3)
        print("native attribute support preserves unknown, requested, supported and lazy getter branches")
    }
}

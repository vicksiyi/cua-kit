import Foundation

@main
struct UIElementVisibleChildrenTests {
    enum Failure: Error { case count }
    static func main() {
        let rows = UIElementAttribute("AXVisibleRows")
        let visible = UIElementAttribute("AXVisibleChildren")
        let children = UIElementAttribute("AXChildren")
        let counts: [Int?] = [nil, -1, 0, 1]
        var cases = 0
        for mask in 0..<8 {
            for rowState in 0...4 {
                for visibleState in 0...4 {
                    for emptyValue in [false, true] {
                        var trace: [String] = []
                        let supported = Set([rows, visible, children].enumerated().compactMap {
                            mask & (1 << $0.offset) != 0 ? $0.element : nil
                        })
                        let result: [String] = uiElementChildrenPreferringVisible(
                            freshSupportedAttributes: { trace.append("fresh"); return supported },
                            count: { attribute in
                                trace.append("count:\(attribute.name as String)")
                                let state = attribute == rows ? rowState : visibleState
                                if state == 4 { throw Failure.count }
                                return counts[state]
                            }, isAttributeSupported: { attribute in
                                precondition(attribute == children)
                                trace.append("children-support"); return supported.contains(children)
                            }, collectionValue: { attribute in
                                trace.append("read:\(attribute.name as String)")
                                return emptyValue ? [] : [attribute.name as String]
                            })
                        var expected = ["fresh"]
                        var chosen: UIElementAttribute?
                        for (attribute, state) in [(rows, rowState), (visible, visibleState)] {
                            if supported.contains(attribute) {
                                expected.append("count:\(attribute.name as String)")
                                if state == 3 { chosen = attribute; break }
                            }
                        }
                        if chosen == nil {
                            expected.append("children-support")
                            if supported.contains(children) { chosen = children }
                        }
                        if let chosen { expected.append("read:\(chosen.name as String)") }
                        precondition(trace == expected)
                        precondition(result == (emptyValue ? [] : chosen.map { [$0.name as String] } ?? []))
                        cases += 1
                    }
                }
            }
        }
        precondition(cases == 400)
        print("visible children selection preserves fresh support, positive counts, precedence and no reread: 400 cases")
    }
}

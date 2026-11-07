import Foundation
import ApplicationServices

@main struct Test {
    static func main() {
        let dom = UIElementAttribute("AXDOMClassList")
        let title = UIElementAttribute("AXTitle")
        var supports = 0, bundles = 0
        func select(_ extra: [UIElementAttribute], supported: Set<UIElementAttribute>, bundle: String?) -> SubtreeAttributeSelection {
            subtreeAttributeSelection(additionalAttributes: extra,
                supportedAttributes: { supports += 1; return supported },
                bundleIdentifier: { bundles += 1; return bundle })
        }
        let empty = select([title, title], supported: [], bundle: nil)
        precondition(empty.requestedAttributes.count == 22)
        precondition(empty.requestedAttributes.suffix(2) == [title, title])
        precondition(Set(empty.requestedAttributes) == uiElementBaseAttributes)
        precondition(empty.arrayAttributes == ["AXChildren", "AXSelectedRows", "AXSelectedCells", "AXSelectedChildren"].map { UIElementAttribute($0) })
        precondition(empty.transactionAttributes.count == 24 && bundles == 0)
        let explicit = select([dom, dom], supported: [dom], bundle: "another.app")
        precondition(explicit.requestedAttributes.filter { $0 == dom }.count == 2 && bundles == 0)
        let matching = select([], supported: [dom], bundle: "com.kishanbagaria.jack")
        precondition(matching.requestedAttributes.last == dom && bundles == 1)
        precondition(!select([], supported: [dom], bundle: nil).requestedAttributes.contains(dom))
        precondition(!select([], supported: [dom], bundle: "another.app").requestedAttributes.contains(dom))
        precondition(supports == 5 && bundles == 3)
        print("Subtree selection preserves base set, duplicate extras and lazy bundle filtering")
    }
}

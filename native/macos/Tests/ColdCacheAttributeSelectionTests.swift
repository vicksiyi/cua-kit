import Foundation
import ApplicationServices

@main
struct ColdCacheAttributeSelectionTests {
    static func main() {
        let base = ["AXRole", "AXSubrole", "AXRoleDescription", "AXTitle", "AXDescription",
            "AXValue", "AXValueDescription", "AXPlaceholderValue", "AXNumberOfCharacters",
            "AXHelp", "AXIdentifier", "AXSelected", "AXFocused", "AXEnabled", "AXDisclosing",
            "AXURL", "AXTraits", "AXServesAsTitleForUIElements", "AXRowIndexRange", "AXColumnIndexRange"]
        let attributes = Set(base.map { UIElementAttribute($0) })
        precondition(attributes.count == 20)
        precondition(coldCacheAttributes(supported: attributes) { fatalError("Unneeded app lookup") } == attributes)
        precondition(coldCacheAttributes(supported: []) { fatalError("Unneeded app lookup") }.isEmpty)
        let extras = ["AXVisibleRows", "AXVisibleChildren", "AXSelectedRows", "AXSelectedCells", "AXSelectedChildren"]
        for mask in 0..<32 {
            let selected = Set(extras.enumerated().filter { mask & (1 << $0.offset) != 0 }.map { UIElementAttribute($0.element) })
            let supported = selected.union([UIElementAttribute("AXRole"), UIElementAttribute("AXChildren"), UIElementAttribute("AXUnknown")])
            precondition(coldCacheAttributes(supported: supported) { fatalError("Unneeded app lookup") } == selected.union([UIElementAttribute("AXRole")]))
        }
        let dom = UIElementAttribute("AXDOMClassList")
        for identifier: String? in [nil, "", "com.kishanbagaria.jack", "COM.KISHANBAGARIA.JACK", "com.kishanbagaria.jack.extra", "ai.multica.desktop"] {
            var lookups = 0
            let result = coldCacheAttributes(supported: [dom, UIElementAttribute("AXTitle")]) { lookups += 1; return identifier }
            precondition(lookups == 1)
            precondition(result.contains(dom) == (identifier == "com.kishanbagaria.jack"))
            precondition(result.contains(UIElementAttribute("AXTitle")))
        }
        print("native cold cache selection preserves supported intersection, all child groups and lazy exact app policy")
    }
}

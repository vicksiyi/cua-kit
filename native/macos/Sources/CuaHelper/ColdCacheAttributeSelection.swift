import Foundation
import ApplicationServices

// Source base-set initializer 0x100764678. Private AXTraits is encoded as a
// Swift string literal by 0x10079cb08; other names use the system SDK constants.
private let coldCacheBaseAttributes: Set<UIElementAttribute> = Set([
    kAXRoleAttribute, kAXSubroleAttribute, kAXRoleDescriptionAttribute,
    kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute,
    kAXValueDescriptionAttribute, kAXPlaceholderValueAttribute,
    kAXNumberOfCharactersAttribute, kAXHelpAttribute, kAXIdentifierAttribute,
    kAXSelectedAttribute, kAXFocusedAttribute, kAXEnabledAttribute,
    kAXDisclosingAttribute, kAXURLAttribute, "AXTraits",
    kAXServesAsTitleForUIElementsAttribute, kAXRowIndexRangeAttribute,
    kAXColumnIndexRangeAttribute,
].map { UIElementAttribute($0) })

// Extracted selection stage only. bundleIdentifier is lazy: the source does
// not resolve the process/app identity unless AXDOMClassList is supported.
// The caller must preserve the separate MockProvider/system identity paths.
func coldCacheAttributes(
    supported: Set<UIElementAttribute>,
    bundleIdentifier: () -> String?
) -> Set<UIElementAttribute> {
    var requested = supported.intersection(coldCacheBaseAttributes)
    let domClassList = UIElementAttribute("AXDOMClassList")
    if supported.contains(domClassList), bundleIdentifier() == "com.kishanbagaria.jack" {
        requested.insert(domClassList)
    }
    // 0x100764d48 and 0x1007666ec collect every supported member, not just the
    // first available one. 0x100765844 inserts those members into the set.
    for name in [kAXVisibleRowsAttribute, kAXVisibleChildrenAttribute,
                 kAXSelectedRowsAttribute, kAXSelectedCellsAttribute,
                 kAXSelectedChildrenAttribute] {
        let attribute = UIElementAttribute(name)
        if supported.contains(attribute) { requested.insert(attribute) }
    }
    return requested
}

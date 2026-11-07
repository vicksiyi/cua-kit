import Foundation
import ApplicationServices

struct SubtreeAttributeSelection {
    let arrayAttributes: [UIElementAttribute]
    let requestedAttributes: [UIElementAttribute]
    var transactionAttributes: Set<UIElementAttribute> {
        Set(requestedAttributes + arrayAttributes)
    }
}

/// Enabled subtree constructor at 0x10076be64..<0x10076c570. Unlike cold
/// element reads, the base attributes are not intersected with root support.
func subtreeAttributeSelection(
    additionalAttributes: [UIElementAttribute],
    supportedAttributes: () -> Set<UIElementAttribute>,
    bundleIdentifier: () -> String?
) -> SubtreeAttributeSelection {
    let arrays = [kAXChildrenAttribute, kAXSelectedRowsAttribute,
                  kAXSelectedCellsAttribute, kAXSelectedChildrenAttribute].map { UIElementAttribute($0) }
    var requested = Array(uiElementBaseAttributes)
    requested.append(contentsOf: additionalAttributes)
    let dom = UIElementAttribute("AXDOMClassList")
    // Source tests support before duplicate membership, then resolves bundle ID.
    if supportedAttributes().contains(dom), !requested.contains(dom),
       bundleIdentifier() == "com.kishanbagaria.jack" {
        requested.append(dom)
    }
    return SubtreeAttributeSelection(arrayAttributes: arrays, requestedAttributes: requested)
}

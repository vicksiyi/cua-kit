import Foundation
import ApplicationServices

// Keys are supplied by the native SPI boundary; their string values are not
// guessed here. Source construction: 0x1006f812c..<0x1006f81ac.
struct AXHierarchyOptionKeys {
    let skipInspectionForAttributes: CFString
    let arrayAttributes: CFString
    let truncateStrings: CFString
    let maxArrayCount: CFString
}

func axHierarchyOptions(
    requestedAttributes: [UIElementAttribute],
    arrayAttributes: [UIElementAttribute],
    maxChildCount: Int,
    keys: AXHierarchyOptionKeys
) -> CFDictionary {
    // Preserve order/duplicates and the caller's count. Source construction
    // does not clamp the value or replace it with the demo's traversal budget.
    let values: [Any] = [requestedAttributes.map(\.name), arrayAttributes.map(\.name), true, maxChildCount]
    let names: [NSString] = [keys.skipInspectionForAttributes as String as NSString,
        keys.arrayAttributes as String as NSString, keys.truncateStrings as String as NSString,
        keys.maxArrayCount as String as NSString]
    return NSDictionary(objects: values, forKeys: names) as CFDictionary
}

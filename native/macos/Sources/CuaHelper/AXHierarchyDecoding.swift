import Foundation
import ApplicationServices

typealias AXHierarchyAttributeTable = [AXUIElement: [UIElementAttribute: AXPartialValue]]

/// Outer bridge and merge flow at 0x1006f8320..<0x1006f8be4.
/// `reread` is the recursive hierarchy call, with the original configuration.
func decodedAXHierarchy(
    _ raw: AnyObject?, arrayAttributes: [CFString],
    resultKeys: AXHierarchyResultKeys, incompleteResultKey: String,
    decodeBoolean: (AnyObject) throws -> Bool?,
    reread: (AXUIElement) -> AXHierarchyAttributeTable
) -> AXHierarchyAttributeTable {
    guard let dictionary = raw as? NSDictionary,
          let elements = dictionary as? [AXUIElement: NSDictionary] else { return [:] }
    var result: AXHierarchyAttributeTable = [:]
    for (element, dictionary) in elements {
        if let marker = dictionary[incompleteResultKey] as AnyObject?, !(marker is NSNull),
           (try? decodeBoolean(marker)) == true {
            // Native replaces whole per-element dictionaries, not individual
            // attributes. A recursive result can contain additional elements.
            for (child, attributes) in reread(element) { result[child] = attributes }
            continue
        }
        // Do not strip the marker before bridging: a malformed entry makes
        // this element's complete attribute-record dictionary fail to bridge.
        guard let records = dictionary as? [String: [String: Any]] else { continue }
        var attributes: [UIElementAttribute: AXPartialValue] = [:]
        for (name, record) in records {
            attributes[UIElementAttribute(name)] = hierarchyAXPartialValue(
                name: name, record: record, arrayAttributes: arrayAttributes,
                elementRecords: records, keys: resultKeys)
        }
        result[element] = attributes
    }
    return result
}

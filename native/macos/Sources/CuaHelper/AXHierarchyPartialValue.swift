import Foundation

struct AXHierarchyResultKeys {
    let value: String
    let count: String
}

/// Attribute-record conversion at 0x1006f8e0c..<0x1006f93a0. The surrounding
/// hierarchy decoder supplies the entire element record for sibling lookups.
func hierarchyAXPartialValue(
    name: String, record: [String: Any], requestedAttributes: [CFString],
    elementRecords: [String: [String: Any]], keys: AXHierarchyResultKeys
) -> AXPartialValue {
    // Native calls Optional<Any>._bridgeToObjectiveC, preserving missing as null.
    let value = record[keys.value] as AnyObject
    let total = record[keys.count] as? Int
    var arrayDescriptor: AXArraySubsetDescriptor?
    if CFGetTypeID(value) == CFArrayGetTypeID() {
        let array = unsafeBitCast(value, to: CFArray.self)
        let available = CFArrayGetCount(array)
        if requestedAttributes.contains(where: { CFEqual($0, name as CFString) }),
           let total, available < total {
            arrayDescriptor = AXArraySubsetDescriptor(count: total, availableRanges: [0..<available])
        } else {
            arrayDescriptor = AXArraySubsetDescriptor(count: available, availableRanges: nil)
        }
    }
    var textDescriptor: AXTruncationDescriptor?
    if name == "AXValue", CFGetTypeID(value) == CFStringGetTypeID(),
       let total = elementRecords["AXNumberOfCharacters"]?[keys.value] as? Int {
        let string = unsafeBitCast(value, to: CFString.self)
        textDescriptor = AXTruncationDescriptor(count: total, availableRange: 0..<CFStringGetLength(string))
    }
    return AXPartialValue(value: AXEncodedValue(value: value),
                          arraySubsetDescriptor: arrayDescriptor, textTruncationDescriptor: textDescriptor)
}

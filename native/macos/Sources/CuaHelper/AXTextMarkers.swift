import ApplicationServices

// Native Swift wrappers recovered from UITextMarker / UITextMarkerRange.
// The C reference types and memory management come from ApplicationServices;
// marker bytes are opaque application data, not a text/index representation.
struct UITextMarker {
    let marker: AXTextMarker
    init(marker: AXTextMarker) { self.marker = marker }
}

struct UITextMarkerRange {
    let range: AXTextMarkerRange
    init(range: AXTextMarkerRange) { self.range = range }
    init(start: UITextMarker, end: UITextMarker) {
        range = AXTextMarkerRangeCreate(nil, start.marker, end.marker)
    }
}

// These concrete branches start after the outer decoder's CF type-ID checks.
// The source converts the Swift wrapper, not the underlying raw CF reference,
// to the requested generic type. Preserve the same throwing-policy boundary.
func decodeAXTextMarker<Value>(_ value: AXTextMarker, throwingOnFailure: Bool, as type: Value.Type) throws -> Value? {
    if let result = UITextMarker(marker: value) as? Value { return result }
    if throwingOnFailure { throw UIElementError.failedToUnwrapAttributeValue(type) }
    return nil
}

func decodeAXTextMarkerRange<Value>(_ value: AXTextMarkerRange, throwingOnFailure: Bool, as type: Value.Type) throws -> Value? {
    if let result = UITextMarkerRange(range: value) as? Value { return result }
    if throwingOnFailure { throw UIElementError.failedToUnwrapAttributeValue(type) }
    return nil
}

// Concrete nonthrowing attribute adapter, not the complete AXEncodedValue
// dispatch. Check the CF type ID before casting opaque Core Foundation types.
func decodedAXTextMarkerAttribute<Value>(_ raw: AnyObject, as type: Value.Type) -> Value? {
    let typeID = CFGetTypeID(raw)
    if typeID == AXTextMarkerGetTypeID() {
        return try? decodeAXTextMarker(raw as! AXTextMarker, throwingOnFailure: false, as: type)
    }
    if typeID == AXTextMarkerRangeGetTypeID() {
        return try? decodeAXTextMarkerRange(raw as! AXTextMarkerRange, throwingOnFailure: false, as: type)
    }
    return nil
}

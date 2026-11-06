import ApplicationServices

// Dynamic cast order in the native encoder at 0x1006ea3e4. The default is the
// Swift runtime's Any-to-Objective-C bridge, not recursive array encoding.
func encodedAXParameter(_ value: Any) throws -> AnyObject {
    switch value {
    case let element as UIElement: return element.axElement
    case let marker as UITextMarker: return encodedAXParameter(marker)
    case let range as UITextMarkerRange: return encodedAXParameter(range)
    case let range as CFRange: return try encodedAXParameter(range)
    case let point as CGPoint: return try encodedAXParameter(point)
    case let rect as CGRect: return try encodedAXParameter(rect)
    case let size as CGSize: return try encodedAXParameter(size)
    default: return value as AnyObject
    }
}

extension AXEncodedValue {
    // Source init(wrapping:) calls this same encoder and propagates its error.
    init(wrapping value: Any) throws {
        self.init(value: try encodedAXParameter(value))
    }
}

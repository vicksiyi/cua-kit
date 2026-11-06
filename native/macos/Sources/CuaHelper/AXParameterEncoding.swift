import ApplicationServices

// Concrete branches of the native parameter encoder at 0x1006ea3e4.
// UIElement wrapper extraction and generic Any-to-object fallback remain separate.
func encodedAXParameter(_ value: UITextMarker) -> AXTextMarker { value.marker }
func encodedAXParameter(_ value: UITextMarkerRange) -> AXTextMarkerRange { value.range }
func encodedAXParameter(_ value: CFRange) throws -> AXValue { try createAXParameterValue(value, type: .cfRange) }
func encodedAXParameter(_ value: CGPoint) throws -> AXValue { try createAXParameterValue(value, type: .cgPoint) }
func encodedAXParameter(_ value: CGRect) throws -> AXValue { try createAXParameterValue(value, type: .cgRect) }
func encodedAXParameter(_ value: CGSize) throws -> AXValue { try createAXParameterValue(value, type: .cgSize) }

// Keep a concrete Value buffer: erasing to Any before the C call would pass
// existential metadata instead of the expected geometry/range bytes.
func createAXParameterValue<Value>(
    _ input: Value,
    type: AXValueType,
    create: (AXValueType, UnsafeRawPointer) -> AXValue? = { AXValueCreate($0, $1) }
) throws -> AXValue {
    var value = input
    guard let encoded = withUnsafePointer(to: &value, { create(type, UnsafeRawPointer($0)) }) else {
        throw UIElementError.failedToWrapAXValue
    }
    return encoded
}

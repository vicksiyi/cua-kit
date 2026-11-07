import ApplicationServices

// Extracted value-field group from the common constructor, not a replacement
// TransformedUIElement owner. Missing cached AXValue bypasses this whole group.
struct TransformedUIElementValueState {
    var value: String?
    var truncationRange: NSRange?
    var valueTypeName: String?
    var isValueSettable: Bool
}

extension UIElement {
    func transformedValueState(contextType: UIElementContextType, isChromium: Bool,
        traversalParentRole: UIElementRole?, reportError: (Error) -> Void,
        reportUnknownDateComponents: (UInt) -> Void
    ) -> TransformedUIElementValueState {
        guard let partial = cache.attributes[UIElementAttribute("AXValue")] else {
            return .init(value: nil, truncationRange: nil, valueTypeName: nil, isValueSettable: false)
        }
        let typeName = transformedValueType().name
        let writable = transformedValueSettable(contextType: contextType, isChromium: isChromium,
            traversalParentRole: traversalParentRole)
        let raw = partial.value.value
        if CFGetTypeID(raw) == CFStringGetTypeID() {
            let result = transformedTextValue(raw as! NSString as String,
                descriptor: partial.textTruncationDescriptor, reportError: reportError)
            return .init(value: result.text, truncationRange: result.truncationRange,
                valueTypeName: typeName, isValueSettable: result.truncationRange == nil && writable)
        }
        return .init(value: formattedTransformedValue(raw, reportError: reportError,
            reportUnknownDateComponents: reportUnknownDateComponents), truncationRange: nil,
            valueTypeName: typeName, isValueSettable: writable)
    }
}

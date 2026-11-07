import Foundation
import ApplicationServices

// 0x10075aed8: capability chooses one path. A failed options read does not
// retry the plain attribute. Both errors and nil propagate to the outer rule.
func uiElementAttributedText(
    for range: UITextMarkerRange,
    supportedParameterizedAttributes: () -> [UIElementAttribute],
    read: (UIElementAttribute, AXEncodedValue) throws -> AXPartialValue?
) throws -> NSAttributedString? {
    let optionsAttribute = UIElementAttribute("AXAttributedStringForTextMarkerRangeWithOptions")
    if supportedParameterizedAttributes().contains(optionsAttribute) {
        return try uiElementAttributedTextWithOptions(for: range, read: read)
    }
    let attribute = UIElementAttribute("AXAttributedStringForTextMarkerRange")
    let parameter = range
    let encoded = try AXEncodedValue(wrapping: parameter)
    guard let partial = try read(attribute, encoded) else { return nil }
    return try decodeAXAttributedString(partial.value.value, throwingOnFailure: true)
}

// Shared 0x10075b620; called directly by the full-text helper without a
// second support probe. The dictionary embeds the raw range, not its wrapper.
func uiElementAttributedTextWithOptions(for range: UITextMarkerRange,
    read: (UIElementAttribute, AXEncodedValue) throws -> AXPartialValue?
) throws -> NSAttributedString? {
    let parameter = ["AXTextMarkerRange": range.range, "AXSpellCheck": false] as [String: Any]
    let encoded = try AXEncodedValue(wrapping: parameter)
    guard let partial = try read(UIElementAttribute("AXAttributedStringForTextMarkerRangeWithOptions"), encoded) else { return nil }
    return try decodeAXAttributedString(partial.value.value, throwingOnFailure: true)
}

// 0x10075abf4. Full-range fallback uses UTF-16 code units, not graphemes.
func uiElementFullAttributedText(
    capturedValue: String?,
    supportedParameterizedAttributes: () -> [UIElementAttribute],
    makeElement: () -> UIElement,
    read: (UIElementAttribute, AXEncodedValue) throws -> AXPartialValue?
) throws -> NSAttributedString? {
    if supportedParameterizedAttributes().contains(UIElementAttribute("AXAttributedStringForTextMarkerRangeWithOptions")) {
        let encoded = try AXEncodedValue(wrapping: makeElement())
        guard let partial = try read(UIElementAttribute("AXTextMarkerRangeForUIElement"), encoded),
            let range = try decodeAXMarkerRange(partial.value.value, throwingOnFailure: true) else { return nil }
        return try uiElementAttributedTextWithOptions(for: range, read: read)
    }
    guard let capturedValue else { return nil }
    let encoded = try AXEncodedValue(wrapping: CFRange(location: 0, length: capturedValue.utf16.count))
    guard let partial = try read(UIElementAttribute("AXAttributedStringForRange"), encoded) else { return nil }
    return try decodeAXAttributedString(partial.value.value, throwingOnFailure: true)
}

extension TransformedUIElement {
    func fullAttributedText() throws -> NSAttributedString? {
        try uiElementFullAttributedText(capturedValue: value,
            supportedParameterizedAttributes: { axElement.supportedParameterizedAttributes },
            makeElement: { UIElement(element: axElement) },
            read: { try axElement.parameterizedValue(for: $0, parameter: $1) })
    }

    // Concrete provider composition: existing dispatch handles owned mock
    // providers before system AX calls, with original error propagation.
    func attributedText(for range: UITextMarkerRange) throws -> NSAttributedString? {
        try uiElementAttributedText(for: range,
            supportedParameterizedAttributes: { axElement.supportedParameterizedAttributes },
            read: { try axElement.parameterizedValue(for: $0, parameter: $1) })
    }
}

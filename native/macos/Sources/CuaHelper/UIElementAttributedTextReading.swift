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
    let attribute: UIElementAttribute
    let parameter: Any
    if supportedParameterizedAttributes().contains(optionsAttribute) {
        attribute = optionsAttribute
        // 0x10075b620 uses the raw CF range inside a two-entry dictionary;
        // wrapping it in UITextMarkerRange here would change ObjC bridging.
        parameter = ["AXTextMarkerRange": range.range, "AXSpellCheck": false] as [String: Any]
    } else {
        attribute = UIElementAttribute("AXAttributedStringForTextMarkerRange")
        parameter = range
    }
    let encoded = try AXEncodedValue(wrapping: parameter)
    guard let partial = try read(attribute, encoded) else { return nil }
    return try decodeAXAttributedString(partial.value.value, throwingOnFailure: true)
}

extension TransformedUIElement {
    // Concrete provider composition: existing dispatch handles owned mock
    // providers before system AX calls, with original error propagation.
    func attributedText(for range: UITextMarkerRange) throws -> NSAttributedString? {
        try uiElementAttributedText(for: range,
            supportedParameterizedAttributes: { axElement.supportedParameterizedAttributes },
            read: { try axElement.parameterizedValue(for: $0, parameter: $1) })
    }
}

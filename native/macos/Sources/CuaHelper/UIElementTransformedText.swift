import ApplicationServices

extension UIElement {
    // Composition of the constructor's String branch and 0x10075ff8c.
    // The returned truncation range must also clear the owner's writable flag;
    // that owner assignment is deliberately not hidden in this text accessor.
    func transformedTextValue(_ text: String, descriptor: AXTruncationDescriptor?,
        reportError: (Error) -> Void
    ) -> (text: String, truncationRange: NSRange?) {
        let descriptor = descriptor ?? AXTruncationDescriptor(
            count: CFStringGetLength(text as CFString), availableRange: nil)
        return transformedUIElementText(text, descriptor: descriptor, role: role,
            visibleCharacterRange: { visibleCharacterRangeValue(reportError: reportError) },
            readStringForRange: readTransformedStringRange,
            rereadValue: {
                try uiElementUncachedValueThrowing(ignoringTypeMismatch: false,
                    isKnownUnsupported: { attributeIsKnownUnsupported(UIElementAttribute("AXValue")) },
                    read: { axElement.value(for: UIElementAttribute("AXValue")) },
                    decode: { try? decodeAXString($0.value.value, throwingOnFailure: false) },
                    decodeThrowing: { try decodeAXString($0.value.value, throwingOnFailure: true) })
            }, reportError: reportError)
    }
}

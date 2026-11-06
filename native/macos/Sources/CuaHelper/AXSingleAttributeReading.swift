import ApplicationServices

// System branch result at 0x1006f61f8..<0x1006f6268. A non-nil system value
// carries no subset/truncation descriptor, independently of the AXError status.
// MockProvider returns its own partial value through a separate source branch.
func partialAXAttributeResult(
    _ result: (error: AXError, value: CFTypeRef?)
) -> (error: AXError, value: AXPartialValue?) {
    (result.error, result.value.map {
        AXPartialValue(value: AXEncodedValue(value: $0),
            arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
    })
}

func readSystemAXAttributeValue(
    _ element: AXUIElement, _ attribute: UIElementAttribute
) -> (error: AXError, value: AXPartialValue?) {
    partialAXAttributeResult(readRawAXAttribute(element, attribute.name as String))
}

extension UIElement {
    func systemFrameValue(reportError: (Error) -> Void) -> CGRect? {
        frameValue(readAttribute: { readSystemAXAttributeValue(axElement, $0) }, reportError: reportError)
    }
}

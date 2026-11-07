import ApplicationServices

func readAXSupportedParameterizedAttributes(_ element: AXUIElement) -> [UIElementAttribute] {
    providerAXSupportedParameterizedAttributes(element) {
        decodedAXSupportedAttributes(onAXProviderReadThread(element) {
            // Native enumeration ignores status and conditionally bridges output.
            rawAXAttributeNamesResult { AXUIElementCopyParameterizedAttributeNames(element, &$0) }
        })
    }
}

func readAXParameterizedValue(_ element: AXUIElement, for attribute: UIElementAttribute,
    parameter: AXEncodedValue
) throws -> AXPartialValue? {
    try providerAXParameterizedValue(element, for: attribute, parameter: parameter) {
        let result: Result<CFTypeRef?, Error> = onAXProviderReadThread(element) {
            Result {
                try rawAXParameterizedAttributeResult {
                    AXUIElementCopyParameterizedAttributeValue(element, attribute.name, parameter.value, &$0)
                }
            }
        }
        return try result.get().map {
            AXPartialValue(value: AXEncodedValue(value: $0), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        }
    }
}

func readAXElementAtPoint(_ point: CGPoint, in element: AXUIElement) throws -> UIElement? {
    try providerAXElementAtPoint(point, in: element) {
        // Native 0x1006f7d80 resumes after sync dispatch, then reads current
        // transaction and constructs the returned UIElement on the caller thread.
        try copiedAXElementAtPoint(point, copy: { x, y, output in
            onAXProviderReadThread(element) {
                AXUIElementCopyElementAtPosition(element, x, y, &output)
            }
        }, construct: { UIElement(element: $0) })
    }
}

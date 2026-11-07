import ApplicationServices

// Source-compatible mock-first front doors. System-only primitives remain
// explicit so fallback cannot recurse back into provider selection.
func readAXAttributeValue(_ element: AXUIElement, _ attribute: UIElementAttribute)
    -> (error: AXError, value: AXPartialValue?) {
    providerAXAttributeValue(element, attribute) { readSystemAXAttributeValue(element, attribute) }
}

func readAXSupportedAttributes(_ element: AXUIElement) -> [UIElementAttribute] {
    providerAXSupportedAttributes(element) { decodedAXSupportedAttributes(readRawAXAttributeNames(element)) }
}

func readAXAttributeValues(_ element: AXUIElement, _ attributes: [UIElementAttribute]) throws
    -> [UIElementAttribute: AXPartialValue] {
    try providerAXAttributeValues(element, attributes) { try readSystemAXAttributeValues(element, attributes) }
}

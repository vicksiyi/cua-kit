import ApplicationServices

// Provider front doors use actualPID-aware dispatch for the system branch.
// Legacy explicitly system-only helpers remain available to existing callers.
func readAXAttributeValue(_ element: AXUIElement, _ attribute: UIElementAttribute)
    -> (error: AXError, value: AXPartialValue?) {
    providerAXAttributeValue(element, attribute) {
        partialAXAttributeResult(onAXProviderReadThread(element) {
            rawAXAttributeResult { AXUIElementCopyAttributeValue(element, attribute.name, &$0) }
        })
    }
}

func readAXSupportedAttributes(_ element: AXUIElement) -> [UIElementAttribute] {
    providerAXSupportedAttributes(element) {
        decodedAXSupportedAttributes(onAXProviderReadThread(element) {
            rawAXAttributeNamesResult { AXUIElementCopyAttributeNames(element, &$0) }
        })
    }
}

func readAXAttributeValues(_ element: AXUIElement, _ attributes: [UIElementAttribute]) throws
    -> [UIElementAttribute: AXPartialValue] {
    try providerAXAttributeValues(element, attributes) {
        let names = attributes.map(\.name) as CFArray
        let result = onAXProviderReadThread(element) {
            rawAXMultipleAttributeResult {
                AXUIElementCopyMultipleAttributeValues(element, names, AXCopyMultipleAttributeOptions(rawValue: 0), &$0)
            }
        }
        return try checkedAXMultipleAttributeValues(attributes, result: result)
    }
}

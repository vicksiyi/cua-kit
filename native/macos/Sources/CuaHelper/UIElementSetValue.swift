import ApplicationServices

// 0x1007a7cd4: encode first, then resolve the AX element, then write exactly
// once. This layer does not add a supported/writable guard or mutate the cache.
func uiElementSetValue(
    _ value: Any,
    forAttribute attribute: UIElementAttribute,
    readAXElement: () -> AXUIElement,
    encode: (Any) throws -> AXEncodedValue = { try AXEncodedValue(wrapping: $0) },
    write: (AXUIElement, AXEncodedValue, UIElementAttribute) throws -> Void
) throws {
    let encoded = try encode(value)
    let element = readAXElement()
    try write(element, encoded, attribute)
}

extension UIElement {
    // Explicit system adapter; full original MockProvider routing is pending.
    func setSystemValue(_ value: Any, forAttribute attribute: UIElementAttribute) throws {
        try uiElementSetValue(value, forAttribute: attribute,
            readAXElement: { axElement }, write: { element, encoded, name in
                try setSystemAXAttribute(element, encoded, for: name)
            })
    }
}

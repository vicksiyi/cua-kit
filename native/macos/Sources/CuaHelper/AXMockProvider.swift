import ApplicationServices

// Reconstructed names for the single method/storage boundary. The pinned
// binary establishes the signature and static optional lifetime, but strips
// the lookup method's source spelling. This is not a TaskLocal backend.
protocol AXMockProvider {
    func lookup(_ element: AXUIElement) -> (any AXUIElementProtocol)?
}

enum AXMockProviderStorage {
    // Original once initializer 0x1006fab7c installs nil at 0x1015ca768.
    // Internal test injection only; no external configuration or policy bypass.
    static var current: (any AXMockProvider)? = nil
}

// A provider miss falls through. A found object's nil/error result does not.
// Keep the two optional levels separate and preserve thrown errors verbatim.
func withAXProvider<Result>(
    _ element: AXUIElement,
    mock: (any AXUIElementProtocol) throws -> Result,
    system: () throws -> Result
) rethrows -> Result {
    if let replacement = AXMockProviderStorage.current?.lookup(element) {
        return try mock(replacement)
    }
    return try system()
}

func providerAXAttributeValue(
    _ element: AXUIElement, _ attribute: UIElementAttribute,
    system: () -> (error: AXError, value: AXPartialValue?)
) -> (error: AXError, value: AXPartialValue?) {
    withAXProvider(element, mock: { $0.value(for: attribute) }, system: system)
}

func providerAXSupportedAttributes(
    _ element: AXUIElement, system: () -> [UIElementAttribute]
) -> [UIElementAttribute] {
    withAXProvider(element, mock: { $0.supportedAttributes }, system: system)
}

func providerAXAttributeValues(
    _ element: AXUIElement, _ attributes: [UIElementAttribute],
    system: () throws -> [UIElementAttribute: AXPartialValue]
) throws -> [UIElementAttribute: AXPartialValue] {
    try withAXProvider(element, mock: { try $0.values(for: attributes) }, system: system)
}

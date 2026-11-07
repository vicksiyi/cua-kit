import ApplicationServices

// Native resolved-object slots +0x28, +0x30, +0x48, +0x50 and +0x58.
// Provider dispatch precedes any system-only coordinate conversion, count
// query or partial-value construction; preserve the supplied arguments/results.
func providerAXArrayValue(_ element: AXUIElement, for attribute: UIElementAttribute,
    index: Int, maxValues: Int, countIfKnown: Int?,
    system: () -> (error: AXError, value: AXPartialValue?)
) -> (error: AXError, value: AXPartialValue?) {
    withAXProvider(element, mock: {
        $0.arrayValue(for: attribute, index: index, maxValues: maxValues, countIfKnown: countIfKnown)
    }, system: system)
}
func providerAXArrayCount(_ element: AXUIElement, for attribute: UIElementAttribute,
    system: () -> (error: AXError, count: Int)
) -> (error: AXError, count: Int) {
    withAXProvider(element, mock: { $0.arrayCount(for: attribute) }, system: system)
}
func providerAXSupportedParameterizedAttributes(_ element: AXUIElement,
    system: () -> [UIElementAttribute]
) -> [UIElementAttribute] {
    withAXProvider(element, mock: { $0.supportedParameterizedAttributes }, system: system)
}
func providerAXParameterizedValue(_ element: AXUIElement, for attribute: UIElementAttribute,
    parameter: AXEncodedValue, system: () throws -> AXPartialValue?
) throws -> AXPartialValue? {
    try withAXProvider(element, mock: { try $0.parameterizedValue(for: attribute, parameter: parameter) }, system: system)
}
func providerAXElementAtPoint(_ point: CGPoint, in element: AXUIElement,
    system: () throws -> UIElement?
) throws -> UIElement? {
    try withAXProvider(element, mock: { try $0.element(at: point) }, system: system)
}

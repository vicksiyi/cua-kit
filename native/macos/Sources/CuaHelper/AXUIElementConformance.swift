import ApplicationServices

// Concrete witness wiring recovered from table 0x10149b1b8.
// Keep the provider-aware entry points, including throwing identity getters.
extension AXUIElement: AXUIElementProtocol {
    var supportedAttributes: [UIElementAttribute] { readAXSupportedAttributes(self) }
    func value(for attribute: UIElementAttribute) -> (error: AXError, value: AXPartialValue?) {
        readAXAttributeValue(self, attribute)
    }
    func values(for attributes: [UIElementAttribute]) throws -> [UIElementAttribute: AXPartialValue] {
        try readAXAttributeValues(self, attributes)
    }
    func arrayValue(for attribute: UIElementAttribute, index: Int, maxValues: Int,
                    countIfKnown: Int?) -> (error: AXError, value: AXPartialValue?) {
        readAXArrayValue(self, for: attribute, index: index, maxValues: maxValues, countIfKnown: countIfKnown)
    }
    func arrayCount(for attribute: UIElementAttribute) -> (error: AXError, count: Int) {
        readAXArrayCount(self, for: attribute)
    }
    func isAttributeSettable(_ attribute: UIElementAttribute) throws -> Bool {
        try isAXAttributeSettable(self, attribute)
    }
    func setValue(_ value: AXEncodedValue, forAttribute attribute: UIElementAttribute) throws {
        try setAXAttribute(self, value, for: attribute)
    }
    var supportedParameterizedAttributes: [UIElementAttribute] { readAXSupportedParameterizedAttributes(self) }
    func parameterizedValue(for attribute: UIElementAttribute, parameter: AXEncodedValue) throws -> AXPartialValue? {
        try readAXParameterizedValue(self, for: attribute, parameter: parameter)
    }
    func element(at point: CGPoint) throws -> UIElement? { try readAXElementAtPoint(point, in: self) }
    var actions: [UIElementAction] { get throws { try readAXActions(self) } }
    func description(for action: UIElementAction) throws -> String? { try readAXActionDescription(self, for: action) }
    func perform(_ action: UIElementAction) throws { try performAXAction(self, action) }
    var pid: Int32 { get throws { try readAXProcessID(self) } }
    var actualPID: Int32 { get throws { try readAXActualProcessID(self) } }
    var windowID: UInt32 { get throws { try readAXWindowID(self) } }
    var bundleIdentifier: String? { readAXBundleIdentifier(self) }

    // 0x1006fab28 checks the other object's CF type before CFEqual.
    // This witness itself does not perform provider substitution.
    func isEqual(to other: any AXUIElementProtocol) -> Bool {
        guard CFGetTypeID(other) == AXUIElementGetTypeID() else { return false }
        return CFEqual(self, other)
    }
}

// 0x1006fb9ac: snapshot one provider, look up left then right, independently
// retain each original on a miss, then call only the left equality witness.
// A readable entry point; not an override of the SDK's Hashable conformance.
func providerAXElementsEqual(_ lhs: AXUIElement, _ rhs: AXUIElement) -> Bool {
    guard let provider = AXMockProviderStorage.current else { return CFEqual(lhs, rhs) }
    let left: any AXUIElementProtocol = provider.lookup(lhs) ?? lhs
    let right: any AXUIElementProtocol = provider.lookup(rhs) ?? rhs
    return left.isEqual(to: right)
}

import ApplicationServices

extension UIElement {
    func focusUsingAttributeOrClick(
        environment: UIElementActionEnvironment,
        reportError: (Error) -> Void,
        clickFallback: () async throws -> Void
    ) async throws {
        let focused = UIElementAttribute(kAXFocusedAttribute)
        try await focusUIElementUsingAttributeOrClick(isFocusable: {
            isFocusable(freshSupportedAttributes: { environment.supported(axElement) },
                isAttributeSettable: { try environment.settable(axElement, $0) })
        }, setFocused: {
            try uiElementSetValue(true, forAttribute: focused,
                readAXElement: { axElement }, write: environment.write)
        }, readUncachedFocused: {
            // Deliberately bypass cached AXFocused after the write. The source
            // still applies known-unsupported gating inside uncachedValue.
            uiElementUncachedValue(operation: {
                try uiElementUncachedValueThrowing(ignoringTypeMismatch: false,
                    isKnownUnsupported: { attributeIsKnownUnsupported(focused) },
                    read: { environment.read(axElement, focused) },
                    decode: { try? decodeAXBool($0.value.value, throwingOnFailure: false) },
                    decodeThrowing: { try decodeAXBool($0.value.value, throwingOnFailure: true) })
            }, reportError: reportError)
        }, clickFallback: clickFallback)
    }
}

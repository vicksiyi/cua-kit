import ApplicationServices

extension UIElementProtocol {
    // Original UIElementProtocol.setValue (0x1007a7cd4) encodes before resolving the
    // element and calls the provider-aware AX setter once, without cache edits.
    func setValue(_ value: Any, forAttribute attribute: UIElementAttribute) throws {
        try uiElementSetValue(value, forAttribute: attribute,
            readAXElement: { axElement }, write: { element, encoded, name in
                try element.setValue(encoded, forAttribute: name)
            })
    }
}

// Transformed witness 0x1007afad4 encodes, then resolves its stored AX handle,
// and invokes the same provider-aware setter. Captured display fields stay put.
extension TransformedUIElement {
    func setValue(_ value: Any, forAttribute attribute: UIElementAttribute) throws {
        try uiElementSetValue(value, forAttribute: attribute,
            readAXElement: { axElement }, write: { element, encoded, name in
                try element.setValue(encoded, forAttribute: name)
            })
    }
}

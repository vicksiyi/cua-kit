import ApplicationServices

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

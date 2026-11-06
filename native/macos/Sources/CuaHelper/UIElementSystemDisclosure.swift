import ApplicationServices

extension UIElement {
    // Compose the recovered toggle and generic setter while retaining a provider
    // boundary for tests and eventual original MockProvider dispatch.
    func toggleDisclosureWritingValue(
        freshSupportedAttributes: () -> Set<UIElementAttribute>,
        isAttributeSettable: (UIElementAttribute) throws -> Bool,
        write: (AXUIElement, AXEncodedValue, UIElementAttribute) throws -> Void
    ) throws {
        try toggleDisclosure(freshSupportedAttributes: freshSupportedAttributes,
            isAttributeSettable: isAttributeSettable, setDisclosing: { next in
                try uiElementSetValue(next, forAttribute: UIElementAttribute("AXDisclosing"),
                    readAXElement: { axElement }, write: write)
            })
    }

    // Requires a genuine caller-supplied UIElement cache. Does not construct an
    // empty cache, advertise synthetic actions, or bypass outer app authorization.
    func toggleSystemDisclosure() throws {
        try toggleDisclosureWritingValue(freshSupportedAttributes: {
            Set(decodedAXSupportedAttributes(readRawAXAttributeNames(axElement)))
        }, isAttributeSettable: {
            try isSystemAXAttributeSettable(axElement, $0)
        }, write: { element, value, attribute in
            try setSystemAXAttribute(element, value, for: attribute)
        })
    }
}

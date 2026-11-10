import ApplicationServices

extension ScrollBarUIElement {
    // Native setter0x1007290bc: bridge the CGFloat, then perform one provider-
    // aware AXValue write. Clamping belongs to the caller's geometry algorithm,
    // not this setter. Do not mutate the observation cache after dispatch.
    func setValue(_ value: CGFloat,
        write: (AXUIElement, AXEncodedValue, UIElementAttribute) throws -> Void = {
            try $0.setValue($1, forAttribute: $2)
        }
    ) throws {
        try uiElementSetValue(value, forAttribute: UIElementAttribute(kAXValueAttribute),
            readAXElement: { axElement }, write: write)
    }
}

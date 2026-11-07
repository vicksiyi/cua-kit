import ApplicationServices

extension TransformedUIElement {
    // Specialized helper 0x1007465fc, called by BOTH expand and collapse.
    // Consult captured flags, not newly queried AX capabilities. The write
    // does not mutate those flags; a fresh observation supplies new state.
    func toggleDisclosure() throws {
        try uiElementToggleDisclosure(isDisclosable: { isDisclosable },
            isDisclosing: { isDisclosing },
            setDisclosing: { try setValue($0, forAttribute: UIElementAttribute(kAXDisclosingAttribute)) })
    }
}

// Predicate 0x100762be4..<0x100762ebc. additionalRole is the optional
// constructor x4 argument; its traversal-level provenance remains explicit.
// Do not replace it with an AXParent read: standalone constructors pass nil.
func transformedUIElementChromiumAllowsValue(role: UIElementRole, subrole: String?,
    additionalRole: UIElementRole?
) -> Bool {
    if role == UIElementRole("AXIncrementor"), let additionalRole,
        [UIElementRole("AXDateField"), UIElementRole("AXDateTimeArea"),
         UIElementRole("AXTimeField")].contains(additionalRole) {
        return false
    }
    // Set initializer 0x100761544: exactly four roles.
    if [UIElementRole("AXComboBox"), UIElementRole("AXIncrementor"),
        .textArea, .textField].contains(role) { return true }
    return role == .radioButton && subrole == "AXTabButton"
}

extension UIElement {
    func transformedValueSettable(contextType: UIElementContextType, isChromium: Bool,
        additionalRole: UIElementRole?
    ) -> Bool {
        transformedValueSettable(contextType: contextType, isChromium: isChromium,
            chromiumAllowsValue: {
                transformedUIElementChromiumAllowsValue(role: role, subrole: subrole,
                    additionalRole: additionalRole)
            })
    }
}

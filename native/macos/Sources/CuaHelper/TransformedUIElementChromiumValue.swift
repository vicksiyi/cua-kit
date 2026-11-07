// Predicate 0x100762be4..<0x100762ebc. The constructor x4 argument is
// the current transformed parent role propagated by tree traversal.
// Do not replace it with an AXParent read: standalone constructors pass nil.
func transformedUIElementChromiumAllowsValue(role: UIElementRole, subrole: String?,
    traversalParentRole: UIElementRole?
) -> Bool {
    if role == UIElementRole("AXIncrementor"), let traversalParentRole,
        [UIElementRole("AXDateField"), UIElementRole("AXDateTimeArea"),
         UIElementRole("AXTimeField")].contains(traversalParentRole) {
        return false
    }
    // Set initializer 0x100761544: exactly four roles.
    if [UIElementRole("AXComboBox"), UIElementRole("AXIncrementor"),
        .textArea, .textField].contains(role) { return true }
    return role == .radioButton && subrole == "AXTabButton"
}

extension UIElement {
    func transformedValueSettable(contextType: UIElementContextType, isChromium: Bool,
        traversalParentRole: UIElementRole?
    ) -> Bool {
        transformedValueSettable(contextType: contextType, isChromium: isChromium,
            chromiumAllowsValue: {
                transformedUIElementChromiumAllowsValue(role: role, subrole: subrole,
                    traversalParentRole: traversalParentRole)
            })
    }
}

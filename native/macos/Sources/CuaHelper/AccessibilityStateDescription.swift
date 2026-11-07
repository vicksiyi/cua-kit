// Status component at 0x100627090. This component does not list AX actions.
func accessibilityStateDescription<Role: AccessibilityRole>(
    role: @autoclosure () -> Role, contextType: @autoclosure () -> UIElementContextType,
    isSelectable: @autoclosure () -> Bool = false, isSelected: @autoclosure () -> Bool = false, isEnabled: @autoclosure () -> Bool = true,
    isDisclosable: @autoclosure () -> Bool = false, isDisclosing: @autoclosure () -> Bool = false,
    valueTypeName: @autoclosure () -> String? = nil, isValueSettable: @autoclosure () -> Bool = false,
    isSentByCurrentUser: @autoclosure () -> Bool = false
) -> String {
    var parts: [String] = []
    if isSelectable() && !isSelected() && contextType() == .fullUIContext { parts.append("selectable") }
    if isSelected() { parts.append("selected") }
    if !isEnabled() && contextType() != .informationalContext && role() != .group && role() != .staticText {
        parts.append("disabled")
    }
    if isDisclosable() { parts.append(isDisclosing() ? "expanded" : "collapsed") }
    if let valueTypeName = valueTypeName(), isValueSettable() {
        parts.append(valueTypeName == "string" ? "settable" : "settable, " + valueTypeName)
    }
    if isSentByCurrentUser() { parts.append("sent by me") }
    return parts.isEmpty ? "" : "(" + parts.joined(separator: ", ") + ")"
}

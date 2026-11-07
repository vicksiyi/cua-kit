// Status component at 0x100627090. This component does not list AX actions.
func accessibilityStateDescription<Role: AccessibilityRole>(
    role: Role, contextType: UIElementContextType,
    isSelectable: Bool = false, isSelected: Bool = false, isEnabled: Bool = true,
    isDisclosable: Bool = false, isDisclosing: Bool = false,
    valueTypeName: String? = nil, isValueSettable: Bool = false,
    isSentByCurrentUser: Bool = false
) -> String {
    var parts: [String] = []
    if isSelectable && !isSelected && contextType == .fullUIContext { parts.append("selectable") }
    if isSelected { parts.append("selected") }
    if !isEnabled && contextType != .informationalContext && role != .group && role != .staticText {
        parts.append("disabled")
    }
    if isDisclosable { parts.append(isDisclosing ? "expanded" : "collapsed") }
    if let valueTypeName, isValueSettable {
        parts.append(valueTypeName == "string" ? "settable" : "settable, " + valueTypeName)
    }
    if isSentByCurrentUser { parts.append("sent by me") }
    return parts.isEmpty ? "" : "(" + parts.joined(separator: ", ") + ")"
}

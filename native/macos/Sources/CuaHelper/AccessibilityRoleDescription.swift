// Role-description component of AccessibilityNode.accessibilityDescription,
// 0x100625f1c..0x100626300. Optional presence is distinct from an empty string.
func accessibilityRoleDescription<Role: AccessibilityRole>(
    role: Role, roleDescription: String?, contextType: UIElementContextType
) -> String {
    if let roleDescription {
        switch role.presentationKind {
        case .menuBarItem, .menuItem, .radioGroup:
            return ""
        case .row:
            return "row"
        case .generic:
            return roleDescription.isEmpty ? "element" : roleDescription
        case .other:
            return role == .group ? "container" : roleDescription
        default:
            return roleDescription
        }
    }
    switch role.presentationKind {
    case .menu: return "menu"
    case .menuBar: return "menu bar"
    case .menuBarItem, .menuItem, .radioGroup: return ""
    default: return contextType == .informationalContext ? "" : "unknown"
    }
}

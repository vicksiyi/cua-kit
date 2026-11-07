// Content guard at 0x1006264a0 and helper 0x1006277fc.
// Laziness preserves the native getter boundary: other contexts do not read
// the role, and only button/checkBox/menuButton read descriptive attributes.
func shouldCollectAccessibilityContent<Role: AccessibilityRole>(
    contextType: UIElementContextType,
    role: @autoclosure () -> Role,
    hasDescriptiveAttributes: @autoclosure () -> Bool
) -> Bool {
    guard contextType == .informationalContext else { return true }
    switch role().presentationKind {
    case .button, .checkBox, .menuButton:
        return hasDescriptiveAttributes()
    case .menu, .menuBar:
        return false
    default:
        return true
    }
}

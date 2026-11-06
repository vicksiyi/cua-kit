// ComputerUseCore.UIElementFlattenedRole field metadata 0x10132122c:
// three immutable String fields; the original also conforms to Equatable.
struct UIElementFlattenedRole: Equatable {
    let separator: String
    let description: String
    let targetDescription: String
}

// Default AccessibilityNode.flattenedRole, 0x10062520c..<0x100625368.
// UIElementRole's AccessibilityRole witness +0x18 returns staticText.
// Constants at 0x101189ce0 encode " ", then "text" reused for both descriptions.
func uiElementFlattenedRole(role: () -> UIElementRole) -> UIElementFlattenedRole? {
    guard role() == .staticText else { return nil }
    return UIElementFlattenedRole(separator: " ", description: "text", targetDescription: "text")
}

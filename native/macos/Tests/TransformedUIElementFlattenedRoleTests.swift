@main
struct TransformedUIElementFlattenedRoleTests {
    static func main() {
        let original = transformedUIElementFlattenedRoles
        defer { transformedUIElementFlattenedRoles = original }
        precondition(original.count == 3)
        let cases = [
            ("AXStaticText", " ", "text", "text"),
            ("AXRadioButton", "; ", "radio button", "radio buttons"),
            ("AXRow", "; ", "outline row", "rows"),
        ]
        for (name, separator, description, target) in cases {
            let actual = transformedUIElementFlattenedRole(role: UIElementRole(name))
            precondition(actual?.separator == separator)
            precondition(actual?.description == description)
            precondition(actual?.targetDescription == target)
        }
        for role in [UIElementRole.button, .image, .unknown, .textField, UIElementRole("axrow")] {
            precondition(transformedUIElementFlattenedRole(role: role) == nil)
        }
        let replacement = UIElementFlattenedRole(separator: "|", description: "item", targetDescription: "items")
        transformedUIElementFlattenedRoles[.staticText] = replacement
        precondition(transformedUIElementFlattenedRole(role: .staticText) == replacement)
        // Source table is mutable. A removed staticText entry must not fall back
        // to AccessibilityNode's default staticText result.
        transformedUIElementFlattenedRoles.removeValue(forKey: .staticText)
        precondition(transformedUIElementFlattenedRole(role: .staticText) == nil)
        precondition(uiElementFlattenedRole(role: { .staticText }) != nil)
        transformedUIElementFlattenedRoles[.button] = replacement
        precondition(transformedUIElementFlattenedRole(role: .button) == replacement)
        transformedUIElementFlattenedRoles.removeAll()
        precondition(transformedUIElementFlattenedRole(role: .row) == nil)
        print("transformed roles preserve three defaults, mutation, removal and no fallback")
    }
}

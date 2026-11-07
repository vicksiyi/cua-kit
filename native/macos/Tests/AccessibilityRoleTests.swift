@main struct Test {
    struct OtherRole: AccessibilityRole {
        let raw: Int
        static let group = Self(raw: 0), staticText = Self(raw: 1), link = Self(raw: 2)
        static let table = Self(raw: 3), image = Self(raw: 4)
    }
    static func kind<R: AccessibilityRole>(_ role: R) -> AccessibilityRoleKind { role.presentationKind }
    static func main() {
        let cases: [(UIElementRole, AccessibilityRoleKind)] = [
            (.button, .button), (.checkBox, .checkBox), (.menu, .menu), (.menuBar, .menuBar),
            (.menuBarItem, .menuBarItem), (.menuButton, .menuButton), (.menuItem, .menuItem),
            (.radioGroup, .radioGroup), (.row, .row), (.generic, .generic),
            (.group, .other), (.link, .other), (.table, .other), (.image, .other),
            (.staticText, .other), (.unknown, .other), (UIElementRole("custom"), .other)]
        for (role, expected) in cases {
            precondition(kind(role) == expected)
            precondition(role.isGrouping == (role == .group))
        }
        precondition(OtherRole.group.isGrouping && !OtherRole.image.isGrouping)
        precondition(kind(OtherRole.group) == .other)
        precondition(UIElementRole("AXGenericElement").presentationKind == .generic)
        precondition(UIElementRole("AXGeneric").presentationKind == .other)
        print("Role protocol dispatch preserves grouping and native presentation categories")
    }
}

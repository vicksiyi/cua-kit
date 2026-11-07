import Foundation

// Protocol descriptor 0x1012c919c: Hashable, five static roles, two getters.
protocol AccessibilityRole: Hashable {
    static var group: Self { get }
    static var staticText: Self { get }
    static var link: Self { get }
    static var table: Self { get }
    static var image: Self { get }
    var isGrouping: Bool { get }
    var presentationKind: AccessibilityRoleKind { get }
}

enum AccessibilityRoleKind {
    case button, checkBox, menu, menuBar, menuBarItem, menuButton, menuItem
    case radioGroup, row, generic, other
}

extension AccessibilityRole {
    var isGrouping: Bool { self == Self.group }
    var presentationKind: AccessibilityRoleKind { .other }
}

extension UIElementRole: AccessibilityRole {
    static let link = UIElementRole("AXLink")
    static let table = UIElementRole("AXTable")
    static let checkBox = UIElementRole("AXCheckBox")
    static let menuBar = UIElementRole("AXMenuBar")
    static let radioGroup = UIElementRole("AXRadioGroup")
    static let generic = UIElementRole("AXGenericElement")

    // Ordered comparisons in 0x10075c8f4; AXGroup is not AXGenericElement.
    var presentationKind: AccessibilityRoleKind {
        if self == .button { return .button }
        if self == .checkBox { return .checkBox }
        if self == .menu { return .menu }
        if self == .menuBar { return .menuBar }
        if self == .menuBarItem { return .menuBarItem }
        if self == .menuButton { return .menuButton }
        if self == .menuItem { return .menuItem }
        if self == .radioGroup { return .radioGroup }
        if self == .row { return .row }
        return self == .generic ? .generic : .other
    }
}

import Foundation

extension AccessibilityNode {
    var valueDescription: String? { nil }
    var valueTypeName: String? { nil }
    var placeholderValue: String? { nil }
    var help: String? { nil }
    var url: URL? { nil }
    var titleTargetIdentities: [ID] { [] }
    var stringValue: String? { value }
    var boolValue: Bool? { nil }
    var isDisclosable: Bool { false }
    var isDisclosing: Bool { false }
    var isSentByCurrentUser: Bool { false }
    var isTableRow: Bool { false }
    var rowIndexRange: ClosedRange<Int>? { nil }
    var columnIndexRange: ClosedRange<Int>? { nil }
    var presentationActions: [AccessibilityPresentationAction] { [] }

    var isFocusableOrSelectable: Bool { isFocusable || isSelectable }
    var canBeUserInteractive: Bool { isFocusable || isSelectable || isValueSettable }
    // 0x100625204 dispatches the canBeUserInteractive requirement at +0xe0.
    // It must honor a conformer's override instead of repeating default checks.
    var hasInterestingActions: Bool { canBeUserInteractive }

    var hasDescriptiveAttributes: Bool {
        if let text = title, !text.isEmpty { return true }
        if let text = description, !text.isEmpty { return true }
        if let text = value, !text.isEmpty { return true }
        if let text = placeholderValue, !text.isEmpty { return true }
        return role == Role.image
    }

    var flattenedRole: UIElementFlattenedRole? {
        guard role == Role.staticText else { return nil }
        return UIElementFlattenedRole(separator: " ", description: "text", targetDescription: "text")
    }
}

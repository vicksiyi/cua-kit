import Foundation

// Full parent contract: 31 getter requirements, descriptor 0x1012c9238.
// Declaring it does not claim UIElement's complete conformance is connected.
protocol AccessibilityNode: Identifiable {
    associatedtype Role: AccessibilityRole
    associatedtype PresentationActions: Sequence where PresentationActions.Element == AccessibilityPresentationAction
    var role: Role { get }
    var roleDescription: String? { get }
    var title: String? { get }
    var description: String? { get }
    var value: String? { get }
    var valueDescription: String? { get }
    var valueTypeName: String? { get }
    var help: String? { get }
    var identifier: String? { get }
    var url: URL? { get }
    var isSelected: Bool { get }
    var isSelectable: Bool { get }
    var isFocused: Bool { get }
    var isFocusable: Bool { get }
    var isEnabled: Bool { get }
    var isDisclosable: Bool { get }
    var isDisclosing: Bool { get }
    var isValueSettable: Bool { get }
    var isSentByCurrentUser: Bool { get }
    var titleTargetIdentities: [ID] { get }
    var stringValue: String? { get }
    var placeholderValue: String? { get }
    var canBeUserInteractive: Bool { get }
    var hasDescriptiveAttributes: Bool { get }
    var hasInterestingActions: Bool { get }
    var boolValue: Bool? { get }
    var isTableRow: Bool { get }
    var flattenedRole: UIElementFlattenedRole? { get }
    var rowIndexRange: ClosedRange<Int>? { get }
    var columnIndexRange: ClosedRange<Int>? { get }
    var presentationActions: PresentationActions { get }
}

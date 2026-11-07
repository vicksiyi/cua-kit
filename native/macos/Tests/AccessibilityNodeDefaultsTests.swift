import Foundation

@main struct Test {
    struct Role: AccessibilityRole {
        let key: Int
        static let group = Self(key: 0), staticText = Self(key: 1), link = Self(key: 2)
        static let table = Self(key: 3), image = Self(key: 4)
    }
    final class Node: AccessibilityNode {
        let id = 17
        var selectedRole: Role = .group
        var reads: [String] = []
        var strings: [String: String] = [:]
        var capability = false
        var role: Role { reads.append("role"); return selectedRole }
        var roleDescription: String? { nil }
        var title: String? { reads.append("title"); return strings["title"] }
        var description: String? { reads.append("description"); return strings["description"] }
        var value: String? { reads.append("value"); return strings["value"] }
        var placeholderValue: String? { reads.append("placeholder"); return strings["placeholder"] }
        var identifier: String? { nil }
        var isSelected: Bool { false }
        var isSelectable: Bool { reads.append("selectable"); return false }
        var isFocused: Bool { false }
        var isFocusable: Bool { reads.append("focusable"); return false }
        var isEnabled: Bool { false }
        var isValueSettable: Bool { reads.append("settable"); return false }
        var canBeUserInteractive: Bool { reads.append("override"); return capability }
    }
    static func interesting<N: AccessibilityNode>(_ node: N) -> Bool { node.hasInterestingActions }
    static func descriptive<N: AccessibilityNode>(_ node: N) -> Bool { node.hasDescriptiveAttributes }
    static func main() {
        let node = Node()
        node.capability = true
        precondition(interesting(node) && node.reads == ["override"])
        node.reads = []; node.strings["title"] = " "
        precondition(descriptive(node) && node.reads == ["title"])
        node.reads = []; node.strings = ["title": "", "placeholder": "hint"]
        precondition(descriptive(node) && node.reads == ["title", "description", "value", "placeholder"])
        node.reads = []; node.strings = [:]; node.selectedRole = .image
        precondition(descriptive(node) && node.reads.last == "role")
        node.selectedRole = .staticText; node.reads = []
        precondition(node.flattenedRole == UIElementFlattenedRole(separator: " ", description: "text", targetDescription: "text"))
        precondition(node.reads == ["role"])
        node.selectedRole = .image; precondition(node.flattenedRole == nil)
        node.strings["value"] = "value"; node.reads = []
        precondition(node.stringValue == "value" && node.reads == ["value"])
        precondition(node.titleTargetIdentities.isEmpty && node.presentationActions.isEmpty)
        precondition(node.url == nil && node.boolValue == nil && node.rowIndexRange == nil && node.columnIndexRange == nil)
        precondition(!node.isTableRow && !node.isDisclosable && !node.isDisclosing && !node.isSentByCurrentUser)
        print("Node defaults preserve generic roles, lazy reads and conformer overrides")
    }
}

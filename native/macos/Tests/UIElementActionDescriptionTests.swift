import Foundation

@main
struct UIElementActionDescriptionTests {
    enum ExpectedError: Error { case failure }
    static func main() {
        let cases: [(String, String)] = [
            ("AXPress", "Press"),
            ("AXPick", "Pick"),
            ("AXIncrement", "Increment"),
            ("AXDecrement", "Decrement"),
            ("AXConfirm", "Confirm"),
            ("AXCancel", "Cancel"),
            ("AXShowDefaultUI", "Show Default UI"),
            ("AXShowAlternateUI", "Show Alternate UI"),
            ("AXRaise", "Raise"),
            ("AXShowMenu", "Show Menu"),
            ("AXScrollToVisible", "Scroll to Visible"),
            ("AXScrollLeftByPage", "Scroll Left"),
            ("AXScrollRightByPage", "Scroll Right"),
            ("AXScrollUpByPage", "Scroll Up"),
            ("AXScrollDownByPage", "Scroll Down"),
            ("AXDelete", "Delete"),
            ("SAIExpand", "Expand"),
            ("SAICollapse", "Collapse"),
        ]
        for (name, description) in cases {
            let result = uiElementActionDescription(UIElementAction(name),
                readNativeDescription: { _ in fatalError("custom description must bypass provider") },
                reportError: { _ in fatalError("unexpected error") })
            precondition(result.action.name == name && result.description == description)
        }
        for (name, expected): (String, String?) in [
            ("Name: Click\nOther: value", "Click"),
            ("Name:  多语言操作\nmetadata", "多语言操作"),
            ("Name:", nil), ("Name:   ", nil),
            ("Name:\nNext", "Next"), ("name: Click", nil),
            (" Name: Click", nil), ("AXExpand", nil), ("axpress", nil)
        ] { precondition(UIElementAction(name).customDescription == expected) }
        var reads = 0
        var errors = 0
        for description: String? in [nil, "", "custom localized text"] {
            let result = uiElementActionDescription(UIElementAction("Unknown"),
                readNativeDescription: { action in
                    precondition(action.name == "Unknown"); reads += 1; return description
                }, reportError: { _ in errors += 1 })
            precondition(result.description == (description ?? "Unknown"))
        }
        let failure = uiElementActionDescription(UIElementAction("Unknown"),
            readNativeDescription: { _ in reads += 1; throw ExpectedError.failure },
            reportError: { error in
                guard case ExpectedError.failure = error else { fatalError("error changed") }
                errors += 1
            })
        precondition(failure.description == "Unknown" && reads == 4 && errors == 1)
        var actionReads = 0
        var descriptionReads: [String] = []
        var listErrors = 0
        let input = [UIElementAction("Unknown"), .press, UIElementAction("Fails"),
                     UIElementAction("Unknown"), .expand]
        let list = uiElementActionDescriptions(readActions: {
            actionReads += 1; return input
        }, readNativeDescription: { action in
            descriptionReads.append(action.name)
            if action.name == "Fails" { throw ExpectedError.failure }
            return "description \(descriptionReads.count)"
        }, reportError: { _ in listErrors += 1 })
        precondition(actionReads == 1 && listErrors == 1)
        precondition(list.map(\.action) == input)
        precondition(list.map(\.description) == ["description 1", "Press", "Fails", "description 3", "Expand"])
        precondition(descriptionReads == ["Unknown", "Fails", "Unknown"])
        let empty = uiElementActionDescriptions(readActions: { [] },
            readNativeDescription: { _ in fatalError("empty list must not read descriptions") },
            reportError: { _ in fatalError("unexpected empty-list error") })
        precondition(empty.isEmpty)
        precondition(UIElementActionDescription(.press, description: "é") ==
                     UIElementActionDescription(.press, description: "e\u{301}"))
        precondition(UIElementActionDescription(.press, description: "Press") !=
                     UIElementActionDescription(.pick, description: "Press"))
        precondition(UIElementActionDescription(.press, description: "Press") !=
                     UIElementActionDescription(.press, description: "Pick"))
        let originalPress = UIElementAction.press
        defer { UIElementAction.press = originalPress }
        UIElementAction.press = .pick
        precondition(UIElementAction.pick.customDescription == "Press")
        precondition(originalPress.customDescription == nil)
        print("native action description precedence, Scanner and fallbacks verified")
    }
}

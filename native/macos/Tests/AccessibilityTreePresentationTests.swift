import Foundation

@main
struct PresentationTests {
    static func main() {
        // Expected strings correspond to the reviewed native basic blocks. This
        // is not a runtime comparison with the proprietary native executable.
        let note = "\n\nNote: Pay special attention to the content selected by the user. If the user asks a question or refers to the content they are looking at on-screen, they might be referring to the selected content (but they might be referring to something else that's visible, too)."
        precondition(AccessibilityTreePresentation.selectedContentNote == note)
        let cases: [(String?, String?, [String], String)] = [
            (nil, nil, [], "body"),
            ("button", nil, [], "body\nThe focused UI element is button"),
            ("", nil, [], "body\nThe focused UI element is "),
            ("button", nil, ["one", "two"], "body\nSelected:\none\ntwo" + note),
            ("button", nil, [""], "body\nSelected:\n" + note),
            ("button", "selection", ["one"], "body\nSelected text: ```\nselection\n```" + note),
            ("button", "", ["one"], "body\nSelected text: ```\n\n```" + note),
            (nil, "first\n```\nlast", [], "body\nSelected text: ```\nfirst\n```\nlast\n```" + note),
        ]
        for (focus, selected, elements, expected) in cases {
            let value = AccessibilityTreePresentation(body: "body", focusedElement: focus, selectedText: selected, selectedElements: elements)
            precondition(value.text == expected, "Presentation whitespace or priority differs")
            precondition(value.focusedElement == focus && value.selectedText == selected && value.selectedElements == elements)
        }
        let empty = AccessibilityTreePresentation(windowTitle: "", applicationName: "", treeLines: [], focusedElement: nil, selectedText: nil, selectedElements: [])
        precondition(empty.text == "Window: \"\", App: .\n\n")
        let full = AccessibilityTreePresentation(windowTitle: "文档\"A", applicationName: "编辑器", treeLines: ["[1] root", "\t[2] child"], focusedElement: "[2]", selectedText: nil, selectedElements: [])
        precondition(full.text == "Window: \"文档\"A\", App: 编辑器.\n[1] root\n\t[2] child\n\nThe focused UI element is [2]")
        let same = AccessibilityTreePresentation(body: "body", focusedElement: nil, selectedText: nil, selectedElements: [])
        precondition(same == AccessibilityTreePresentation(body: "body", focusedElement: nil, selectedText: nil, selectedElements: []))
        print("10 native presentation formatting cases passed")
    }
}

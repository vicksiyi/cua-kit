// Reconstructed from the pinned native ARM64 constructors and Swift metadata.
// This formatter is not yet wired into SkyAppState: its AX tree/selection inputs
// still need to be restored. See docs/NATIVE-AX-DIFF.md for the evidence boundary.
struct AccessibilityTreePresentation: Equatable {
    static let selectedContentNote = "\n\nNote: Pay special attention to the content selected by the user. If the user asks a question or refers to the content they are looking at on-screen, they might be referring to the selected content (but they might be referring to something else that's visible, too)."

    var text: String
    var focusedElement: String?
    var selectedText: String?
    var selectedElements: [String]

    init(body: String, focusedElement: String?, selectedText: String?, selectedElements: [String]) {
        self.focusedElement = focusedElement
        self.selectedText = selectedText
        self.selectedElements = selectedElements
        text = body
        if let selectedText {
            text += "\nSelected text: ```\n" + selectedText + "\n```"
            text += Self.selectedContentNote
        } else if !selectedElements.isEmpty {
            text += "\nSelected:\n" + selectedElements.joined(separator: "\n")
            text += Self.selectedContentNote
        } else if let focusedElement {
            text += "\nThe focused UI element is " + focusedElement
        }
    }

    init(windowTitle: String, applicationName: String, treeLines: [String], focusedElement: String?, selectedText: String?, selectedElements: [String]) {
        self.init(
            body: "Window: \"" + windowTitle + "\", App: " + applicationName + ".\n" + treeLines.joined(separator: "\n") + "\n",
            focusedElement: focusedElement,
            selectedText: selectedText,
            selectedElements: selectedElements
        )
    }
}

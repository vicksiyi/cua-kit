// Reconstructed from the pinned native ARM64 constructors and Swift metadata.
// This formatter is not yet wired into SkyAppState: its AX tree/selection inputs
// still need to be restored. See docs/NATIVE-AX-DIFF.md for the evidence boundary.
struct AccessibilityTreePresentation: Equatable {
    // Nonempty difference branch0x100239080..0x1002391f4. Empty output
    // follows a separate branch and still preserves selection/focus context.
    static func difference(windowTitle: String, from baseline: SystemSelection.DifferenceBaseline,
        lines: [String], summarizesRemovedElementIDs: Bool, focusedElement: String?,
        selectedText: String?, selectedElements: [String]) -> Self {
        if lines.isEmpty {
            return unchanged(windowTitle: windowTitle, focusedElement: focusedElement,
                selectedText: selectedText, selectedElements: selectedElements)
        }
        let introduction: String
        switch baseline {
        case .previous: introduction = "The following is a diff from the previous accessibility tree"
        case .initial: introduction = "The following is a cumulative diff from the initial accessibility tree"
        }
        let legend = summarizesRemovedElementIDs
            ? "with ~ and + representing changed and added elements, respectively. Removed elements are summarized by ID range."
            : "with ~, +, and - representing changed, added, and removed elements, respectively."
        return Self(body: introduction + " for Window: \"" + windowTitle + "\" " + legend
            + "\n" + lines.joined(separator: "\n"), focusedElement: focusedElement,
            selectedText: selectedText, selectedElements: selectedElements)
    }

    // SystemSelection.llmDescription empty diff0x1002393d8..0x10023949c.
    // Focus/selection context is still appended by the shared presentation.
    static func unchanged(windowTitle: String, focusedElement: String?,
        selectedText: String?, selectedElements: [String]) -> Self {
        Self(body: "There has been no change in the accessibility tree for Window: \""
            + windowTitle + "\".", focusedElement: focusedElement,
            selectedText: selectedText, selectedElements: selectedElements)
    }

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

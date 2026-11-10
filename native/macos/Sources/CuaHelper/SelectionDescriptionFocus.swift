// Prefix0x100238d18..0x100238e3c of SystemSelection.llmDescription.
// Selected text (including a present empty String) takes precedence over the
// focus render tree. This is not the complete final description formatter.
struct SelectionDescriptionFocus {
    var selectedText: String?
    var lines: [String]

    //0x100238e44..ec8 uses array count, not embedded newline count.
    var presentationContext: (focusedElement: String?, selectedText: String?, selectedElements: [String]) {
        if let selectedText { return (nil, selectedText, []) }
        if lines.count == 1 { return (lines[0], nil, []) }
        return (nil, nil, lines)
    }
}

func selectionDescriptionFocus(readSelectedText: () -> String?,
    readFocusLines: () -> [String]?
) -> SelectionDescriptionFocus {
    if let text = readSelectedText() {
        return SelectionDescriptionFocus(selectedText: text, lines: [])
    }
    return SelectionDescriptionFocus(selectedText: nil, lines: readFocusLines() ?? [])
}

extension SystemSelection {
    func descriptionFocus(lineOptions: UIElementRenderLineOptions) -> SelectionDescriptionFocus {
        descriptionFocus(lineOptions: lineOptions, readSelectedText: { $0.selectedText })
    }

    // Explicit accessor seam for controlled extraction/description checks.
    func descriptionFocus(lineOptions: UIElementRenderLineOptions,
        readSelectedText: (TransformedUIElement) -> String?
    ) -> SelectionDescriptionFocus {
        selectionDescriptionFocus(readSelectedText: {
            windowRevision.tree.focusedElement.flatMap(readSelectedText)
        }, readFocusLines: {
            windowRevision.focusRenderTree?.lines(indent: "\t", options: lineOptions)
        })
    }
}

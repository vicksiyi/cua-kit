// Generic content component 0x100626300. Reads fields in native order; URL
// shortening mutates the shared rendering context before later text is read.
extension AccessibilityNode {
    func accessibilityContentDescription<Context: AccessibilityRenderingContext>(
        context: inout Context
    ) -> String where Context.Role == Role {
        guard shouldCollectAccessibilityContent(contextType: context.type,
            role: role, hasDescriptiveAttributes: hasDescriptiveAttributes) else { return "" }
        var content = AccessibilityContentAccumulator()
        func appendText(_ text: String?, label: String?) {
            guard let text, !text.isEmpty else { return }
            content.appendUnique(.init(label: label, text: text))
        }
        appendText(title, label: nil)
        appendText(description, label: "Description")
        content.appendIndexRange(label: "Rows", range: rowIndexRange)
        content.appendIndexRange(label: "Columns", range: columnIndexRange)
        if let url {
            let isImage = role == .image
            if let text = context.urlShortener.trim(url: url, isImage: isImage) {
                // Native checks optional presence only, not string emptiness.
                content.appendUnique(.init(label: "URL", text: text))
            }
        }
        appendText(help, label: "Help")
        appendText(value, label: "Value")
        appendText(valueDescription, label: "Details")
        appendText(placeholderValue, label: "Placeholder")
        content.appendIdentifier(identifier)
        content.appendSecondaryActions(presentationActions)
        return formatAccessibilityContent(content.entries)
    }
}

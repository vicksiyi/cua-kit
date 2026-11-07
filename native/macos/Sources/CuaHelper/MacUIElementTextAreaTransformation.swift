import Foundation

extension MacUIElementTreeTransformation {
    // Tag 11 at 0x100759a84. The readFullText and render closures are explicit
    // extraction seams for 0x10075abf4 and the attributed-run formatter;
    // neither is replaced by a plain-string fallback here.
    static func retrieveAttributedTextFromTextAreas(
        item: UIElementTree<TransformedUIElement>.Item,
        context: inout UIElementTransformationContext,
        readTextualContent: () -> String?,
        readFullText: () throws -> NSAttributedString?,
        readRange: (NSRange) throws -> NSAttributedString?,
        render: (NSAttributedString, inout UIElementTransformationContext) -> TransformedUIString
    ) -> UIElementTreeTransformation.Result<TransformedUIElement> {
        guard item.element.role == .textArea else { return .unchanged }
        guard readTextualContent() != "AXTextualContextSourceCode" else { return .unchanged }
        guard item.element.value != nil else { return .unchanged }
        let attributed: NSAttributedString?
        do {
            if let range = item.element.truncationRange {
                // Native NSRange -> internal range conversion, 0x100759db4:
                // NSNotFound is represented by -1 before parameter encoding.
                attributed = try readRange(NSRange(
                    location: range.location == NSNotFound ? -1 : range.location,
                    length: range.length))
            } else {
                attributed = try readFullText()
            }
        } catch {
            // Source releases the read/decode error and keeps the input.
            return .unchanged
        }
        guard let attributed else { return .unchanged }
        let text = render(attributed, &context)
        var result = item
        result.element.attributedString = attributed
        result.element.transformedString = text
        result.element.value = text.description
        // Unlike the web-area branch, text-area success retains its subtree.
        return .transformed(result)
    }
}

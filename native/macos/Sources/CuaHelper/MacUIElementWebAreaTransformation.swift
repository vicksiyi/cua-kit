import Foundation

extension MacUIElementTreeTransformation {
    // Tag 12 at 0x100759714. Provider closures preserve the native typed
    // reads and parameterized-value boundaries; formatting is still supplied
    // by the attributed-run renderer, not an invented plain-text fallback.
    static func retrieveAttributedTextFromWebAreas(
        item: UIElementTree<TransformedUIElement>.Item,
        context: inout UIElementTransformationContext,
        supportsChromeNodeID: () -> Bool,
        readStartMarker: () -> UITextMarker?,
        readEndMarker: () -> UITextMarker?,
        nextLineEnd: (UITextMarker) throws -> UITextMarker?,
        reportUnexpectedNextLine: () -> Void,
        readRange: (UITextMarkerRange) throws -> NSAttributedString?,
        render: (NSAttributedString, inout UIElementTransformationContext) -> TransformedUIString
    ) -> UIElementTreeTransformation.Result<TransformedUIElement> {
        guard context.type == .informationalContext,
            item.element.role == .webArea, !supportsChromeNodeID(),
            let start = readStartMarker(), let end = readEndMarker() else {
            return .unchanged
        }
        // The source probes from END, not START. A nonnil response aborts;
        // nil or encoding/read/decode failure proceeds with the original range.
        if (try? nextLineEnd(end)) != nil {
            reportUnexpectedNextLine()
            return .unchanged
        }
        let range = UITextMarkerRange(start: start, end: end)
        guard let attributed = try? readRange(range) else { return .unchanged }
        let text = render(attributed, &context)
        var result = item
        result.element.attributedString = attributed
        result.element.transformedString = text
        result.element.value = text.description
        result.subtree.items = []
        return .transformed(result)
    }
}

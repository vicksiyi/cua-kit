import AppKit
import ApplicationServices

/// Compose the recovered native attributed-string formatter components in the
/// branch order of 0x100770530. The terminal empty run closes pending formats.
func renderNativeAttributedText(_ attributed: NSAttributedString,
    context: inout UIElementTransformationContext,
    reportUnknownStyle: (String) -> Void,
    makeElement: (AXUIElement) -> UIElement = { UIElement(element: $0) }
) -> TransformedUIString {
    var renderer = AttributedTextBoundaryRenderer()
    traverseAttributedTextRuns(attributed) { source, attributes in
        var formats = AttributedTextFontStyles(attributes: attributes).orderedFormats
        let numeric = AttributedTextNumericStyles(attributes: attributes)
        if numeric.underline { formats.append(.underline) }
        if numeric.strikethrough { formats.append(.strikethrough) }
        switch numeric.baseline {
        case .normal: break
        case .superscript: formats.append(.superscript)
        case .subscript: formats.append(.subscript)
        }
        let linked = transformAttributedTextLink(source, attributes: attributes,
            context: &context, makeElement: makeElement)
        let attached = transformAttributedTextAttachment(linked, attributes: attributes,
            context: &context, makeElement: makeElement)
        formats += attributedTextNamedFormats(attributes, reportUnknownStyle: reportUnknownStyle)
        if let list = attributedTextListFormat(attributes) { formats.append(list) }
        renderer.append(attached, formats: formats)
    }
    return renderer.output
}

import AppKit
import ApplicationServices

/// Native attachment branch 0x10077116c..<0x1007717c8, with the image arm at
/// 0x100771fbc..<0x1007721e8. Preserves original multiline text after its caption.
func transformAttributedTextAttachment(_ run: AttributedTextSourceRun,
    attributes: [NSAttributedString.Key: Any],
    context: inout UIElementTransformationContext,
    makeElement: (AXUIElement) -> UIElement = { UIElement(element: $0) },
    shorten: (URL, Bool, inout UIElementTransformationContext) -> String? = {
        $2.urlShortener.trim(url: $0, isImage: $1)
    }
) -> AttributedTextSourceRun {
    guard let attachment = attributes[.accessibilityAttachment] else { return run }
    let raw = attachment as AnyObject
    precondition(CFGetTypeID(raw) == AXUIElementGetTypeID())
    let element = makeElement(raw as! AXUIElement)
    let isPlaceholder = run.text.isEmpty || (run.text.count == 1 &&
        run.text.unicodeScalars.first?.value == 0xfffc)
    // The native loop iterates Characters and inspects their first scalar.
    let multiline = !isPlaceholder && run.text.contains { character in
        guard let scalar = character.unicodeScalars.first?.value else { return false }
        return (0x0a...0x0d).contains(scalar) || scalar == 0x85 ||
            scalar == 0x2028 || scalar == 0x2029
    }
    let label: AttributedTextSourceRun? = isPlaceholder || multiline ? nil : run
    func generated(_ text: String) -> AttributedTextSourceRun {
        AttributedTextSourceRun(text: text, sourceOffsets: Array(repeating: nil, count: text.utf16.count))
    }
    var result: AttributedTextSourceRun
    if element.role == .image, let url = element.url, let target = shorten(url, true, &context) {
        let caption = (label ?? generated(element.description ?? ""))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let suffix = "](" + target + ")"
        result = AttributedTextSourceRun(text: "![" + caption.text + suffix,
            sourceOffsets: [nil, nil] + caption.sourceOffsets + Array(repeating: nil, count: suffix.utf16.count))
    } else {
        var caption = element.roleDescription ?? "attachment"
        if let description = label?.text ?? element.description, !description.isEmpty {
            caption += ": " + description
        }
        // Generic captions are generated: even copied label text loses its map.
        result = generated("[" + caption + "]")
    }
    if multiline {
        result = AttributedTextSourceRun(text: result.text + " " + run.text,
            sourceOffsets: result.sourceOffsets + [nil] + run.sourceOffsets)
    }
    return result
}

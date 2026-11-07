import AppKit
import ApplicationServices

extension AttributedTextSourceRun {
    /// Mapped text constructor used after generated Markdown changes its length.
    init(text: String, sourceOffsets: [Int?]) {
        precondition(text.utf16.count == sourceOffsets.count)
        self.text = text
        self.sourceOffsets = sourceOffsets
    }

    /// 0x100773780: trim by Foundation, locate the result in NSString, and slice
    /// source offsets. Generated/nonlocatable content has no source positions.
    func trimmingCharacters(in set: CharacterSet) -> Self {
        let trimmed = text.trimmingCharacters(in: set)
        if trimmed.isEmpty { return Self(text: "", sourceOffsets: []) }
        let range = (text as NSString).range(of: trimmed)
        guard range.location != NSNotFound else {
            return Self(text: trimmed, sourceOffsets: Array(repeating: nil, count: trimmed.utf16.count))
        }
        return Self(text: trimmed,
            sourceOffsets: Array(sourceOffsets[range.location..<(range.location + range.length)]))
    }
}

/// AXLink branch at 0x100770ca4..<0x10077116c. AXLink holds an AX element,
/// not a URL string. Uses that element's transaction-backed cached URL/role.
/// This transforms a run; it does not implement remaining rich-text formatting.
func transformAttributedTextLink(_ run: AttributedTextSourceRun,
    attributes: [NSAttributedString.Key: Any],
    context: inout UIElementTransformationContext,
    makeElement: (AXUIElement) -> UIElement = { UIElement(element: $0) }
) -> AttributedTextSourceRun {
    guard let link = attributes[.accessibilityLink] else { return run }
    let raw = link as AnyObject
    // The original uses a forced AXUIElement cast. CF type identity must be
    // checked explicitly in source Swift before casting opaque CF objects.
    precondition(CFGetTypeID(raw) == AXUIElementGetTypeID())
    let element = makeElement(raw as! AXUIElement)
    guard let url = element.url else { return run }
    guard let target = context.urlShortener.trim(url: url, isImage: element.role == .image) else {
        return run
    }
    let label = run.trimmingCharacters(in: .whitespacesAndNewlines)
    let suffix = "](" + target + ")"
    return AttributedTextSourceRun(text: "[" + label.text + suffix,
        sourceOffsets: [nil] + label.sourceOffsets + Array(repeating: nil, count: suffix.utf16.count))
}

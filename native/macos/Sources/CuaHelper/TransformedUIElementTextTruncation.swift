import Foundation

// Extracted policy 0x10075ff8c..<0x1007603dc; dependency names are local.
// The constructor supplies a descriptor even for complete text, synthesizing
// count from CFStringGetLength when the original partial value has none.
func transformedUIElementText(
    _ text: String,
    descriptor: AXTruncationDescriptor,
    role: UIElementRole,
    visibleCharacterRange: () -> NSRange?,
    readStringForRange: (CFRange) throws -> String?,
    rereadValue: () throws -> String?,
    reportError: (Error) -> Void
) -> (text: String, truncationRange: NSRange?) {
    // Source helper 0x10078fa68 checks these three roles once.
    guard role == .textArea || role == .textField || role == .staticText else {
        return (text, nil)
    }
    if max(text.count, descriptor.count) > 100_000 {
        let visible = visibleCharacterRange()
        let range = visible.flatMap { $0.length > 0 ? $0 : nil }
            ?? NSRange(location: 0, length: 100_000)
        return (transformedUIElementString(in: range, from: text,
            readStringForRange: readStringForRange), range)
    }
    guard let available = descriptor.availableRange else { return (text, nil) }
    let length = available.upperBound - available.lowerBound
    guard length < descriptor.count else { return (text, nil) }
    do {
        // The source ignores the reread result's truncation descriptor: a
        // successfully decoded String clears the old range, even if empty.
        if let complete = try rereadValue() { return (complete, nil) }
    } catch {
        reportError(error)
    }
    return (text, NSRange(location: available.lowerBound, length: length))
}

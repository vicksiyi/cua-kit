import Foundation

// appendMarkdownLink 0x10063a574..<0x10063ab88. Role classification and
// the mutable context's shortener are explicit dependencies until restored.
// Label selection precedes trimming: a whitespace-only value wins over title.
func appendTransformedUIStringMarkdownLink(
    url: URL, isImage: Bool, stringValue: String?, title: String?, description: String?,
    trimURL: (URL, Bool) -> String?,
    spans: inout [TransformedUIStringSpan], sourceOffsets: inout [Int?]?
) {
    let label = [stringValue, title, description].compactMap { $0 }.first { !$0.isEmpty }
    var incoming: [TransformedUIStringSpan] = []
    var incomingOffsets: [Int?]? = nil
    func append(_ span: TransformedUIStringSpan) {
        appendTransformedUIStringSpan(span, spans: &incoming, sourceOffsets: &incomingOffsets)
    }
    if let label {
        let escaped = label.replacing("[", with: "\\[")
            .replacing("]", with: "\\]")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        append(.string("["))
        append(.string(escaped))
        append(.string("]("))
    } else {
        append(.string("<"))
    }
    append(.url(trimURL(url, isImage) ?? "", url: url, isImage: isImage))
    append(.string(label == nil ? ">" : ")"))
    mergeTransformedUIString(incomingSpans: incoming, incomingOffsets: incomingOffsets,
        spans: &spans, sourceOffsets: &sourceOffsets)
}

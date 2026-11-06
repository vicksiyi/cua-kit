// removeLast(), 0x10063a2f8 -> 0x100639834..<0x100639bec.
// Only the final span is touched. Empty span arrays are a no-op, but an empty
// final span traps via String.removeLast; it does not scan preceding spans.
func removeLastTransformedUIStringCharacter(
    spans: inout [TransformedUIStringSpan], sourceOffsets: inout [Int?]?
) {
    guard let span = spans.last else { return }
    let text: String
    switch span {
    case .string(let value), .url(let value, _, _): text = value
    }
    let removedLength = text.last.map { String($0).utf16.count } ?? 0
    var shortened = text
    shortened.removeLast()
    switch span {
    case .string: spans[spans.count - 1] = .string(shortened)
    case .url(_, let url, let isImage):
        spans[spans.count - 1] = .url(shortened, url: url, isImage: isImage)
    }
    // Keep the span even when now empty. Preserve nil versus empty mapping.
    if removedLength > 0, sourceOffsets != nil {
        sourceOffsets!.removeLast(removedLength)
    }
}

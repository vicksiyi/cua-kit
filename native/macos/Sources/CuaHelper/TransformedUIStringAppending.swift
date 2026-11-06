// Shared span merge from 0x100639134 and 0x100639bec: only consecutive plain
// string spans coalesce. URL spans retain their payload and boundaries.
private func appendTransformedSpan(_ span: TransformedUIStringSpan, to spans: inout [TransformedUIStringSpan]) {
    if case .string(let incoming) = span, let last = spans.last, case .string(let previous) = last {
        spans[spans.count - 1] = .string(previous + incoming)
    } else {
        spans.append(span)
    }
}

// Unmapped append 0x100639134..<0x1006394cc preserves nil offsets. Once mapping
// exists, each appended UTF-16 code unit gets nil, without erasing old mappings.
func appendTransformedUIStringSpan(_ span: TransformedUIStringSpan,
    spans: inout [TransformedUIStringSpan], sourceOffsets: inout [Int?]?
) {
    appendTransformedSpan(span, to: &spans)
    let count = transformedUIStringDescription(spans: [span]).utf16.count
    if sourceOffsets != nil {
        sourceOffsets!.append(contentsOf: repeatElement(nil, count: count))
    }
}

// Mapped append 0x100639bec..<0x100639f08. The source checks the input count
// before any mutation; an invalid count traps. Supplied offsets are not rebased.
func appendMappedTransformedUIString(_ text: String, offsets: [Int?],
    spans: inout [TransformedUIStringSpan], sourceOffsets: inout [Int?]?
) {
    precondition(offsets.count == text.utf16.count)
    let previousLength = transformedUIStringDescription(spans: spans).utf16.count
    appendTransformedSpan(.string(text), to: &spans)
    if sourceOffsets == nil {
        sourceOffsets = Array(repeating: nil, count: previousLength)
    }
    sourceOffsets!.append(contentsOf: offsets)
}

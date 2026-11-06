// appendInterpolation(TransformedUIString), 0x100639544..<0x100639834.
// Preserve each span's ordinary append behavior, then replace the temporary
// nil padding with the incoming mapping. Offsets are source coordinates and
// must not be shifted by the length of the destination text.
func mergeTransformedUIString(
    incomingSpans: [TransformedUIStringSpan], incomingOffsets: [Int?]?,
    spans: inout [TransformedUIStringSpan], sourceOffsets: inout [Int?]?
) {
    let previousLength = transformedUIStringDescription(spans: spans).utf16.count
    for span in incomingSpans {
        appendTransformedUIStringSpan(span, spans: &spans, sourceOffsets: &sourceOffsets)
    }
    guard incomingOffsets != nil || sourceOffsets != nil else { return }
    let prefix = sourceOffsets.map { Array($0.prefix(previousLength)) }
        ?? Array<Int?>(repeating: nil, count: previousLength)
    let appendedLength = transformedUIStringDescription(spans: spans).utf16.count - previousLength
    sourceOffsets = prefix + (incomingOffsets ?? Array<Int?>(repeating: nil, count: appendedLength))
}

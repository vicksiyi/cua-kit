// TransformedUIString.isEmpty body 0x10063b87c..<0x10063bb5c.
// Structural emptiness is intentionally not description.isEmpty: two empty
// spans still count as nonempty, including adjacent URL boundaries.
func transformedUIStringIsEmpty(spans: [TransformedUIStringSpan]) -> Bool {
    guard let span = spans.last else { return true }
    guard spans.count == 1 else { return false }
    switch span {
    case .string(let text), .url(let text, _, _): return text.isEmpty
    }
}

// Getter 0x10063a1c8..<0x10063a2f8 reads only the last span. Do not skip
// empty tails or join spans: joining can change Unicode grapheme boundaries.
func transformedUIStringLast(spans: [TransformedUIStringSpan]) -> Character? {
    guard let span = spans.last else { return nil }
    switch span {
    case .string(let text), .url(let text, _, _): return text.last
    }
}

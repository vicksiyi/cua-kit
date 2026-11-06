import Foundation

// sourceRange(forMarkdownRange:), 0x10063a300 -> 0x10063bba0..<0x10063bd5c.
// Mapping indices are UTF-16 offsets. Preserve checked arithmetic and the source
// ordering: absent mapping skips all validation; nil entries inside a valid slice
// are compacted, then the first and last surviving offsets define the result.
func transformedUIStringSourceRange(forMarkdownRange range: NSRange, sourceOffsets: [Int?]?) -> NSRange? {
    guard let sourceOffsets else { return nil }
    guard range.location >= 0, range.location != NSNotFound, range.length >= 0 else { return nil }
    let end = range.location + range.length
    guard end <= sourceOffsets.count else { return nil }
    let mapped = sourceOffsets[range.location..<end].compactMap { $0 }
    guard let first = mapped.first, let last = mapped.last else { return nil }
    return NSRange(location: first, length: last - first + 1)
}

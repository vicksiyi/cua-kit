import Foundation

// Occurrence search 0x10063bd5c..<0x10063c0ac bridges description to
// NSString. Search options are zero; subsequent searches start one UTF16
// unit after the MATCH START (not its end), preserving overlapping matches.
func transformedUIStringMarkdownRanges(
    of substring: String, prefix: String?, suffix: String?,
    spans: [TransformedUIStringSpan]
) -> [NSRange] {
    let text = transformedUIStringDescription(spans: spans) as NSString
    guard !substring.isEmpty else { return [] }
    var start = 0
    var matches: [NSRange] = []
    while start < text.length {
        let match = text.range(of: substring, options: [], range: NSRange(location: start, length: text.length - start))
        guard match.location != NSNotFound else { break }
        defer { start = match.location + 1 }
        if let prefix {
            let length = (prefix as NSString).length
            let location = match.location - length
            guard location >= 0,
                  text.substring(with: NSRange(location: location, length: length)) == prefix else { continue }
        }
        if let suffix {
            let length = (suffix as NSString).length
            let location = match.location + match.length
            guard location + length <= text.length,
                  text.substring(with: NSRange(location: location, length: length)) == suffix else { continue }
        }
        matches.append(match)
    }
    return matches
}

// 0x10063a31c..<0x10063a380: ambiguity is rejected before source mapping;
// multiple matches do not become unique merely because only one is mapped.
func transformedUIStringSourceRange(
    ofMarkdownSubstring substring: String, prefix: String?, suffix: String?,
    spans: [TransformedUIStringSpan], sourceOffsets: [Int?]?
) -> NSRange? {
    let matches = transformedUIStringMarkdownRanges(of: substring, prefix: prefix, suffix: suffix, spans: spans)
    guard matches.count == 1 else { return nil }
    return transformedUIStringSourceRange(forMarkdownRange: matches[0], sourceOffsets: sourceOffsets)
}

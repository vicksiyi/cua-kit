import Foundation

// trimURLs entry 0x10063aea8 -> 0x10063ab88..<0x10063aea8.
// The context's mutable URL shortener stays an explicit dependency until its
// full implementation is restored. No sourceOffsets edits occur in this body.
func refreshTransformedUIStringURLs(
    spans: inout [TransformedUIStringSpan],
    trim: (URL, Bool) -> String?
) -> Bool {
    var changed = false
    for index in spans.indices {
        guard case .url(let previous, let url, let isImage) = spans[index] else { continue }
        let text = trim(url, isImage) ?? ""
        if text != previous {
            spans[index] = .url(text, url: url, isImage: isImage)
            changed = true
        }
    }
    return changed
}

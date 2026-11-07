import Foundation

extension AttributedTextSourceRun {
    /// 0x100773bb0: iterate grapheme clusters, replacing only Character("\n").
    /// Replacement mappings are supplied by the caller; the original LF's
    /// mapping is discarded. CRLF is one different Character and stays intact.
    func replacingLineFeeds(with replacement: Self) -> Self {
        var output = ""
        var offsets: [Int?] = []
        var position = 0
        for character in text {
            let part = String(character)
            let end = position + part.utf16.count
            if character == "\n" {
                output += replacement.text
                offsets.append(contentsOf: replacement.sourceOffsets)
            } else {
                output += part
                offsets.append(contentsOf: sourceOffsets[position..<end])
            }
            position = end
        }
        return Self(text: output, sourceOffsets: offsets)
    }
}

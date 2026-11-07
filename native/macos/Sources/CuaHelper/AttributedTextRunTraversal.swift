import Foundation

/// Host name for the three-word value constructed at 0x100777ce0. Each UTF-16
/// code unit carries its original attributed-string offset (including surrogate
/// halves). This is not the completed rich-text formatting state machine.
struct AttributedTextSourceRun {
    let text: String
    let sourceOffsets: [Int?]

    init(text: String, range: NSRange) {
        precondition(text.utf16.count == range.length)
        let end = range.location + range.length
        precondition(end >= range.location)
        self.text = text
        sourceOffsets = (range.location..<end).map { Optional($0) }
    }
}

/// Native enumeration adapter 0x10077045c and the outer textarea/webarea
/// drivers. The empty terminal run flushes formatting state even for empty
/// input. `consume` must implement the native formatter; there is deliberately
/// no plain-text fallback. State/context are captured by that synchronous sink.
func traverseAttributedTextRuns(_ attributed: NSAttributedString,
    consume: (AttributedTextSourceRun, [NSAttributedString.Key: Any]) -> Void
) {
    attributed.enumerateAttributes(in: NSRange(location: 0, length: attributed.length),
                                   options: []) { attributes, range, _ in
        let text = attributed.attributedSubstring(from: range).string
        consume(AttributedTextSourceRun(text: text, range: range), attributes)
    }
    consume(AttributedTextSourceRun(text: "",
        range: NSRange(location: attributed.length, length: 0)), [:])
}

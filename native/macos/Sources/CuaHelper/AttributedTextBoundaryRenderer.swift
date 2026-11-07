import Foundation

/// Boundary/composition tail of 0x100770530, beginning at 0x100772764.
/// The caller supplies already transformed link/attachment text and formats.
struct AttributedTextBoundaryRenderer {
    private var formats = AttributedTextFormatState()
    private(set) var output = TransformedUIString()

    mutating func append(_ input: AttributedTextSourceRun, formats requested: [AttributedTextFormat]) {
        let change = formats.transition(to: requested)
        var run = input
        if output.last == "\n" {
            output.removeLast()
            run = generated("\n").appending(run)
        }
        let hasBlock = change.requested.contains { format in
            switch format {
            case .heading, .blockQuote, .list, .codeBlock, .collapsed: return true
            default: return false
            }
        }
        let leadingLF = run.text.first == "\n" && run.text.count > 1
        if leadingLF { run = run.droppingFirstCharacter() }
        if hasBlock {
            let marks = attributedTextFormatBoundaries(closing: Array(change.requested), opening: Array(change.requested))
            let trailingLF = run.text.last == "\n"
            if trailingLF { run = run.droppingLastCharacter() }
            run = run.replacingLineFeeds(with: generated(marks.closing + "\n" + marks.opening))
            if trailingLF { run = run.appending(generated("\n")) }
        }
        if hasBlock && leadingLF {
            let marks = attributedTextFormatBoundaries(closing: Array(change.previous), opening: Array(change.requested))
            run = generated(marks.closing + "\n" + marks.opening).appending(run)
        } else {
            let marks = attributedTextFormatBoundaries(closing: Array(change.closing), opening: Array(change.opening))
            if leadingLF {
                run = generated(marks.closing + "\n" + marks.opening).appending(run)
            } else {
                output += marks.closing + marks.opening
            }
        }
        output.appendMappedString(run.text, sourceOffsets: run.sourceOffsets)
    }

    private func generated(_ text: String) -> AttributedTextSourceRun {
        AttributedTextSourceRun(text: text, sourceOffsets: Array(repeating: nil, count: text.utf16.count))
    }
}

private extension AttributedTextSourceRun {
    func appending(_ other: Self) -> Self {
        Self(text: text + other.text, sourceOffsets: sourceOffsets + other.sourceOffsets)
    }
    func droppingFirstCharacter() -> Self {
        guard let first = text.first else { return self }
        return Self(text: String(text.dropFirst()), sourceOffsets: Array(sourceOffsets.dropFirst(String(first).utf16.count)))
    }
    func droppingLastCharacter() -> Self {
        guard let last = text.last else { return self }
        return Self(text: String(text.dropLast()), sourceOffsets: Array(sourceOffsets.dropLast(String(last).utf16.count)))
    }
}

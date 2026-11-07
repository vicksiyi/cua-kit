import Foundation

// Original descriptors 0x1012c9600/0x1012c961c: the outer struct stores one
// StringInterpolation, which owns spans and optional UTF-16 source offsets.
// Rendering-context URL overloads remain pending the full rendering protocol.
struct TransformedUIString: ExpressibleByStringInterpolation, CustomStringConvertible {
    private var stringInterpolation: StringInterpolation

    struct StringInterpolation: StringInterpolationProtocol, ExpressibleByStringLiteral,
        CustomStringConvertible {
        fileprivate var spans: [TransformedUIStringSpan]
        fileprivate var sourceOffsets: [Int?]?

        // 0x100638c78: checked addition, clamp negatives to zero, reserve spans.
        init(literalCapacity: Int, interpolationCount: Int) {
            spans = []
            spans.reserveCapacity(max(0, literalCapacity + interpolationCount))
            sourceOffsets = nil
        }

        // 0x10063cc34 -> 0x10063a11c: exactly one plain span, including "".
        init(stringLiteral value: String) {
            spans = [.string(value)]
            sourceOffsets = nil
        }

        var description: String { transformedUIStringDescription(spans: spans) }

        mutating func appendLiteral(_ literal: String) { appendInterpolation(literal) }

        mutating func appendInterpolation(_ value: String) {
            appendTransformedUIStringSpan(.string(value), spans: &spans,
                sourceOffsets: &sourceOffsets)
        }

        mutating func appendInterpolation(_ value: TransformedUIString) {
            mergeTransformedUIString(incomingSpans: value.stringInterpolation.spans,
                incomingOffsets: value.stringInterpolation.sourceOffsets,
                spans: &spans, sourceOffsets: &sourceOffsets)
        }
    }

    // 0x10063a084 creates ONE empty span; the interpolation-capacity initializer
    // creates zero spans. Preserve this distinction for structural operations.
    init() { stringInterpolation = StringInterpolation(stringLiteral: "") }
    init(_ value: String) { stringInterpolation = StringInterpolation(stringLiteral: value) }
    init(stringLiteral value: String) { self.init(value) }
    init(stringInterpolation: StringInterpolation) { self.stringInterpolation = stringInterpolation }

    var description: String { stringInterpolation.description }
    var isEmpty: Bool { transformedUIStringIsEmpty(spans: stringInterpolation.spans) }
    var last: Character? { transformedUIStringLast(spans: stringInterpolation.spans) }

    mutating func removeLast() {
        removeLastTransformedUIStringCharacter(spans: &stringInterpolation.spans,
            sourceOffsets: &stringInterpolation.sourceOffsets)
    }

    mutating func appendMappedString(_ value: String, sourceOffsets: [Int?]) {
        appendMappedTransformedUIString(value, offsets: sourceOffsets,
            spans: &stringInterpolation.spans, sourceOffsets: &stringInterpolation.sourceOffsets)
    }

    func sourceRange(forMarkdownRange range: NSRange) -> NSRange? {
        transformedUIStringSourceRange(forMarkdownRange: range,
            sourceOffsets: stringInterpolation.sourceOffsets)
    }

    func sourceRange(ofMarkdownSubstring substring: String,
        prefix: String? = nil, suffix: String? = nil
    ) -> NSRange? {
        transformedUIStringSourceRange(ofMarkdownSubstring: substring, prefix: prefix,
            suffix: suffix, spans: stringInterpolation.spans,
            sourceOffsets: stringInterpolation.sourceOffsets)
    }

    static func += (lhs: inout Self, rhs: String) {
        lhs.stringInterpolation.appendInterpolation(rhs)
    }
    static func += (lhs: inout Self, rhs: Self) {
        lhs.stringInterpolation.appendInterpolation(rhs)
    }
    static func + (lhs: Self, rhs: Self) -> Self {
        var result = lhs
        result += rhs
        return result
    }
}

import Foundation

// Original private StringInterpolation.Span (nominal 0x1012c9640), kept under
// a local name until the full interpolation and source-offset engine is restored.
enum TransformedUIStringSpan {
    case string(String)
    case url(String, url: URL, isImage: Bool)
}

// Shared description body 0x10063b5f8..<0x10063b808 selects the String payload
// of both cases and joins with an empty separator. URL/image metadata is retained
// in spans but not re-rendered here; sourceOffsets are not read by this getter.
func transformedUIStringDescription(spans: [TransformedUIStringSpan]) -> String {
    spans.map { span in
        switch span {
        case .string(let text), .url(let text, _, _): return text
        }
    }.joined()
}

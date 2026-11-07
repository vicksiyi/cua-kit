import Foundation

// Value layout built at 0x100628e10: optional label, original text, then a Bool.
// The descriptive flag name is reconstructed; native private symbol is stripped.
struct AccessibilityContentEntry {
    let label: String?
    let text: String
    let isLongOrMultiline: Bool

    init(label: String?, text: String) {
        self.label = label
        self.text = text
        // Swift Character distance, not UTF-8/UTF-16 length. A successful
        // 101-character advance short-circuits the Foundation substring test.
        if text.index(text.startIndex, offsetBy: 101, limitedBy: text.endIndex) != nil {
            isLongOrMultiline = true
        } else {
            isLongOrMultiline = text.contains("\n")
        }
    }

    // 0x100627b88 passes the unchanged label and numeric payload to 0x100628e10.
    static func indexRange(label: String, range: ClosedRange<Int>?) -> Self? {
        guard let text = accessibilityIndexRangeText(range) else { return nil }
        return Self(label: label, text: text)
    }
}

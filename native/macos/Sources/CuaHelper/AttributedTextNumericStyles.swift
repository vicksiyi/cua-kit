import AppKit

/// Numeric AX attribute branches of the formatter at 0x100770530. Host names
/// describe recovered semantics; this is only one input to the pending complete
/// formatting state machine (font/link/list/attachment and transition rules).
struct AttributedTextNumericStyles: Equatable {
    enum Baseline: Equatable { case normal, superscript, `subscript` }
    let underline: Bool
    let strikethrough: Bool
    let baseline: Baseline

    init(attributes: [NSAttributedString.Key: Any]) {
        // All three paths dynamically cast to NSNumber, not String/NSString.
        let underlineNumber = attributes[NSAttributedString.Key.accessibilityUnderline] as? NSNumber
        underline = (underlineNumber?.intValue ?? 0) > 0
        let strikeNumber = attributes[NSAttributedString.Key.accessibilityStrikethrough] as? NSNumber
        strikethrough = strikeNumber?.boolValue ?? false
        let baselineNumber = attributes[NSAttributedString.Key.accessibilitySuperscript] as? NSNumber
        if let baselineNumber, baselineNumber.intValue > 0 {
            baseline = .superscript
        } else if let baselineNumber, baselineNumber.intValue < 0 {
            baseline = .subscript
        } else {
            baseline = .normal
        }
    }
}

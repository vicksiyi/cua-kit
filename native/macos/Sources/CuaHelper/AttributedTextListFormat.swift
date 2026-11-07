import AppKit

/// Native list branch at 0x100771dd4, 0x10077267c and 0x1007732d0.
/// The prefix classifies the list; the numeric index supplies ordered text.
func attributedTextListFormat(_ attributes: [NSAttributedString.Key: Any]) -> AttributedTextFormat? {
    guard let level = attributes[.accessibilityListItemLevel] as? NSNumber,
          let prefix = attributes[.accessibilityListItemPrefix] as? NSAttributedString,
          let index = attributes[.accessibilityListItemIndex] as? NSNumber else { return nil }
    let text = prefix.string
    let marker: String
    switch text {
    case "checklist item, incomplete": marker = "* [ ]"
    case "checklist item, completed": marker = "* [x]"
    default:
        marker = text.first?.isNumber == true ? index.stringValue + "." : "*"
    }
    return .list(level: level.intValue, index: index.intValue, prefix: marker)
}

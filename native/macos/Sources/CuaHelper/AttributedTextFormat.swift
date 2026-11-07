import Foundation

/// Host names for the native formatter's four payload categories. The list
/// identity includes its index even though the boundary renderer uses its prefix.
enum AttributedTextFormat: Hashable {
    case heading(Int)
    case blockQuote(Int)
    case list(level: Int, index: Int, prefix: String)
    case codeBlock, collapsed, bold, italic, underline, strikethrough, superscript, `subscript`
}

/// 0x100777e7c..<0x100778208. Consumes caller-ordered closing/opening arrays;
/// it does not compute the diff or reverse closing order on the caller's behalf.
func attributedTextFormatBoundaries(closing: [AttributedTextFormat], opening: [AttributedTextFormat])
    -> (closing: String, opening: String) {
    var close = "", open = ""
    for format in closing {
        switch format {
        case .heading, .blockQuote, .list: break
        case .codeBlock: close += "\n```"
        case .collapsed: close += "\n</summary>(collapsed content is hidden)</details>"
        case .bold: close += "**"
        case .italic: close += "*"
        case .underline: close += "</u>"
        case .strikethrough: close += "~~"
        case .superscript: close += "</sup>"
        case .subscript: close += "</sub>"
        }
    }
    for format in opening {
        switch format {
        // Block boundaries are inserted at the front, unlike inline marks.
        case .heading(let level): open = String(repeating: "#", count: level) + " " + open
        case .blockQuote(let level): open = String(repeating: ">", count: level) + " " + open
        case .list(let level, _, let prefix): open = String(repeating: " ", count: level * 4) + prefix + " " + open
        case .codeBlock: open = "```\n" + open
        case .collapsed: open = "<details><summary>\n" + open
        case .bold: open += "**"
        case .italic: open += "*"
        case .underline: open += "<u>"
        case .strikethrough: open += "~~"
        case .superscript: open += "<sup>"
        case .subscript: open += "<sub>"
        }
    }
    return (close, open)
}

/// AXBlockQuoteLevel and AXStyleName input branches, in native insertion order.
/// Unknown names are reported individually; known nonformatting names are ignored.
func attributedTextNamedFormats(_ attributes: [NSAttributedString.Key: Any],
    reportUnknownStyle: (String) -> Void
) -> [AttributedTextFormat] {
    var formats: [AttributedTextFormat] = []
    if let level = attributes[NSAttributedString.Key("AXBlockQuoteLevel")] as? NSNumber,
       level.intValue > 0 { formats.append(.blockQuote(level.intValue)) }
    guard let names = attributes[NSAttributedString.Key("AXStyleName")] as? String else { return formats }
    for name in names.components(separatedBy: ", ") {
        let format: AttributedTextFormat
        switch name {
        case "Title": format = .heading(1)
        case "Heading": format = .heading(2)
        case "Subheading": format = .heading(3)
        case "Fixed width": format = .codeBlock
        case "Collapsed": format = .collapsed
        case "Body", "Contains paragraphs", "Expanded": continue
        default: reportUnknownStyle(name); continue
        }
        if !formats.contains(format) { formats.append(format) }
    }
    return formats
}

extension UIElementRenderDifference.Change {
    // Single-render branches of0x10062c538: none emits nothing; update uses
    // the new cursor, removal the old cursor. Marker precedes indentation,
    // with no added separator. Subtree expansion is a separate native path.
    func rootDifferenceLine(indent: Character, options: UIElementRenderLineOptions) -> String? {
        let marker: String
        let cursor: Cursor
        switch self {
        case .none: return nil
        case .insert(_, let new): marker = "+"; cursor = new
        case .update(_, let new, _): marker = "~"; cursor = new
        case .remove(_, let old): marker = "-"; cursor = old
        }
        return marker + cursor.item.line(indent: indent, indentCount: cursor.depth, options: options)
    }
}

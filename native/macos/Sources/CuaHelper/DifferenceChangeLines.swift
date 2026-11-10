import DequeModule
import Foundation

extension UIElementRenderDifference.Change {
    //0x10062c538 and map0x1006366a0. Traversal uses a tail pop and
    // appends forward-enumerated children; retain reverse sibling order.
    func lines(indent: Character, options: UIElementRenderLineOptions) -> [String] {
        let root: Cursor
        let marker: String
        switch self {
        case .none: return []
        case .update: return [rootDifferenceLine(indent: indent, options: options)!]
        case .insert(_, let new):
            if options.contains(.withoutInsertionSubtree) {
                return [rootDifferenceLine(indent: indent, options: options)!]
            }
            root = new; marker = "+"
        case .remove(_, let old):
            if options.contains(.withoutRemovalSubtree) {
                return [rootDifferenceLine(indent: indent, options: options)!]
            }
            root = old; marker = "-"
        }
        var pending = Deque([Cursor(item: root.item, path: IndexPath(index: 0))])
        var result: [String] = []
        while let cursor = pending.popLast() {
            pending.append(contentsOf: cursor.childCursors())
            result.append(marker + cursor.item.line(indent: indent,
                indentCount: root.depth + cursor.depth, options: options))
        }
        return result
    }
}

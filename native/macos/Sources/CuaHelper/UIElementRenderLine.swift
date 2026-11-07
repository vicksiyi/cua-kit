// Native static storage 0x10118a6f0..0x10118a710; rawValue is Swift.Int.
struct UIElementRenderLineOptions: OptionSet {
    let rawValue: Int
    static let withoutElementID = Self(rawValue: 1)
    static let withoutDetailText = Self(rawValue: 2)
    static let withoutInsertionSubtree = Self(rawValue: 4)
    static let withoutRemovalSubtree = Self(rawValue: 8)
}

extension UIElementRender {
    // 0x10063e0b0. Indentation applies once to the whole string, not to each
    // embedded line. A present but empty detail still contributes its separator.
    func line(indent: Character, indentCount: Int, options: UIElementRenderLineOptions) -> String {
        let body: String
        if !options.contains(.withoutDetailText), let detailText {
            body = text + " " + detailText
        } else {
            body = text
        }
        let prefix = String(repeating: indent, count: indentCount)
        if !options.contains(.withoutElementID), let elementID {
            return prefix + String(elementID) + " " + body
        }
        return prefix + body
    }
}

extension UIElementRenderTree {
    // 0x10063e25c. A focus tree's immediate root children are the selection;
    // descendants are not flattened, copied, filtered, or deduplicated.
    func selectionSubtree() -> UIElementRenderTree<Identity>? {
        guard isFocus else { return nil }
        let selected = roots.flatMap(\.children)
        guard !selected.isEmpty else { return nil }
        return UIElementRenderTree(isFocus: false, roots: selected)
    }
}

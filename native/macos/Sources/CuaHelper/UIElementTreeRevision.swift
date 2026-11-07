import Foundation

// Native revision is a reference type. This restores root construction and
// lookup; appended revisions, changes and serialized snapshots remain separate.
final class UIElementTreeRevision<Element: AccessibilityNode> {
    let lineageID: String
    let tree: UIElementTree<Element>
    let renderTree: UIElementRenderTree<Element.ID>
    let focusTree: UIElementTree<Element>?
    let focusRenderTree: UIElementRenderTree<Element.ID>?
    let ids: UIElementTreeTable<Element.ID, Int>
    let previousRevision: UIElementTreeRevision<Element>?
    typealias MissingSourcePathError = MissingRenderSourcePathError

    private init(tree: UIElementTree<Element>, renderTree: UIElementRenderTree<Element.ID>,
        focusTree: UIElementTree<Element>?, focusRenderTree: UIElementRenderTree<Element.ID>?,
        lineageID: String
    ) throws {
        self.tree = tree
        self.renderTree = renderTree
        self.focusTree = focusTree
        self.focusRenderTree = focusRenderTree
        self.lineageID = lineageID
        previousRevision = nil
        ids = try makeRevisionTable(renderTree: renderTree, focusRenderTree: focusRenderTree)
    }

    // 0x1006564b4: render full tree, number it, render optional focus tree,
    // then construct the revision. A thrown focus render leaves full IDs assigned.
    static func root(_ tree: UIElementTree<Element>, focusTree: UIElementTree<Element>?,
        lineageID: String,
        render: (UIElementTree<Element>) throws -> UIElementRenderTree<Element.ID>
    ) throws -> UIElementTreeRevision<Element> {
        let rendered = try render(tree)
        rendered.setElementIDs()
        let focused = try focusTree.map(render)
        return try Self(tree: tree, renderTree: rendered, focusTree: focusTree,
            focusRenderTree: focused, lineageID: lineageID)
    }

    func item(for id: Int) -> UIElementTree<Element>.Item? {
        revisionTreeItem(for: id, ids: ids, tree: tree, focusTree: focusTree)
    }
    func element(for id: Int) -> Element? { item(for: id)?.element }

    // 0x10064986c: walk references to the earliest revision, no lineage string test.
    var lineageRootRevision: UIElementTreeRevision<Element> {
        var root = self
        while let previous = root.previousRevision { root = previous }
        return root
    }
}

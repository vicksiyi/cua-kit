import Foundation

// 0x100654b9c builds a compacted [renderTree, focusRenderTree] sequence,
// flattens each depth-first traversal, and feeds 0x100656fcc with the resolver.
// A later focus path overwrites the full-tree path for a reused display ID.
func makeRevisionTable<Identity: Hashable>(
    renderTree: UIElementRenderTree<Identity>,
    focusRenderTree: UIElementRenderTree<Identity>?
) throws -> UIElementTreeTable<Identity, Int> {
    var identities: [Identity: Int] = [:]
    var values: [Identity: Int] = [:]
    var paths: [Int: IndexPath] = [:]
    var nextID = renderTree.nextAvailableElementIDIterator()
    func visit(_ nodes: [UIElementRender<Identity>]) throws {
        for node in nodes {
            let entry = try resolveRevisionRenderIdentity(node, identities: &identities, nextID: &nextID)
            values[entry.identity] = entry.elementID
            paths[entry.elementID] = entry.sourcePath
            try visit(node.children)
        }
    }
    try visit(renderTree.roots)
    if let focusRenderTree { try visit(focusRenderTree.roots) }
    return UIElementTreeTable(values: values, paths: paths)
}

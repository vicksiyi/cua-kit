import Foundation

struct UIElementRenderTree<Identity: Hashable> {
    let isFocus: Bool
    let roots: [UIElementRender<Identity>]
}

extension UIElementTree {
    // Generic render entry 0x10064e090 and its compactTreeMap at 0x10064c280.
    // Keep source paths even when omitted ancestors change the output hierarchy.
    func render<Context: AccessibilityRenderingContext>(
        with context: inout Context,
        _ renderer: (Element, inout Context) throws -> String
    ) rethrows -> UIElementRenderTree<Element.ID> where Element.Role == Context.Role {
        var nodes: [IndexPath: UIElementRender<Element.ID>] = [:]
        var ancestorPaths: [IndexPath: IndexPath] = [:]
        var rootPaths: [IndexPath] = []

        func visit(_ items: [Item], at parentPath: IndexPath) throws {
            for (index, item) in items.enumerated() {
                let path = parentPath.appending(index)
                let ancestorPath = ancestorPaths[path.dropLast()]
                if let node = try item.renderNode(sourcePath: path, context: &context, render: renderer) {
                    nodes[path] = node
                    ancestorPaths[path] = path
                    if let ancestorPath, let parent = nodes[ancestorPath] {
                        parent.append(child: node)
                    } else {
                        rootPaths.append(path)
                    }
                } else if let ancestorPath {
                    // Native nil branch records current path -> surviving ancestor.
                    // It still advances the depth-first iterator into children.
                    ancestorPaths[path] = ancestorPath
                }
                try visit(item.children, at: path)
            }
        }
        try visit(items, at: IndexPath())
        return UIElementRenderTree(isFocus: isFocusTree(), roots: rootPaths.compactMap { nodes[$0] })
    }
}

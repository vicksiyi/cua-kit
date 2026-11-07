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

extension UIElementRenderTree {
    // 0x10063dc28 enumerates depth-first cursors and unconditionally replaces
    // each node's display ID with its zero-based traversal offset.
    func setElementIDs() {
        var offset = 0
        func visit(_ nodes: [UIElementRender<Identity>]) {
            for node in nodes {
                node.elementID = offset
                offset += 1
                visit(node.children)
            }
        }
        visit(roots)
    }

    // 0x10063deec -> callback 0x10063e00c. Depth is the RENDER traversal
    // path count minus one, independent of the original sourcePath depth.
    func lines(indent: Character, options: UIElementRenderLineOptions) -> [String] {
        var result: [String] = []
        func visit(_ nodes: [UIElementRender<Identity>], depth: Int) {
            for node in nodes {
                result.append(node.line(indent: indent, indentCount: depth, options: options))
                visit(node.children, depth: depth + 1)
            }
        }
        visit(roots, depth: 0)
        return result
    }
}

extension UIElementRenderTree {
    // 0x10063deb4 captures the tree value and leaves the cached maximum nil.
    func nextAvailableElementIDIterator() -> NextAvailableElementIDIterator {
        NextAvailableElementIDIterator(tree: self)
    }

    struct NextAvailableElementIDIterator {
        private let tree: UIElementRenderTree<Identity>
        private var maxElementID: Int?

        fileprivate init(tree: UIElementRenderTree<Identity>) { self.tree = tree }

        // 0x10063ebbc: scan lazily on first next; thereafter increment only the
        // cached maximum. This API returns Int, not an optional iterator result.
        mutating func next() -> Int {
            if maxElementID == nil {
                var maximum: Int?
                func visit(_ nodes: [UIElementRender<Identity>]) {
                    for node in nodes {
                        if let id = node.elementID {
                            maximum = maximum.map { Swift.max($0, id) } ?? id
                        }
                        visit(node.children)
                    }
                }
                visit(tree.roots)
                maxElementID = maximum ?? 0
            }
            let next = maxElementID! + 1
            maxElementID = next
            return next
        }
    }
}

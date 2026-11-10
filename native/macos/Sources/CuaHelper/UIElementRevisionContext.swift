import Foundation

extension UIElementTreeRevision where Element: LMReadableElement & UIElementProtocol {
    // 0x10076b838: generate lowercase time-based lineage ID and share the same
    // inout rendering context across full and optional focus render callbacks.
    static func root(_ tree: UIElementTree<Element>, focusTree: UIElementTree<Element>?,
        context: inout UIElementTransformationContext
    ) throws -> UIElementTreeRevision<Element> {
        let lineageID = UUID(timestamp: Date()).uuidString.lowercased()
        return try root(tree, focusTree: focusTree, lineageID: lineageID) { tree in
            try tree.render(with: &context)
        }
    }

    // 0x10076ba54 explicitly supplies nil; it does not infer a focus tree.
    static func root(_ tree: UIElementTree<Element>, context: inout UIElementTransformationContext
    ) throws -> UIElementTreeRevision<Element> {
        try root(tree, focusTree: nil, context: &context)
    }
}


extension UIElementTreeRevision where Element: LMReadableElement & UIElementProtocol {
    //0x10076b6f4 shares the rendering context across full/focus callbacks.
    func appending(tree: UIElementTree<Element>, focusTree: UIElementTree<Element>?,
        context: inout UIElementTransformationContext
    ) throws -> UIElementTreeRevision<Element> {
        try appending(tree: tree, focusTree: focusTree) { try $0.render(with: &context) }
    }

    func appending(tree: UIElementTree<Element>, context: inout UIElementTransformationContext
    ) throws -> UIElementTreeRevision<Element> {
        try appending(tree: tree, focusTree: nil, context: &context)
    }
}

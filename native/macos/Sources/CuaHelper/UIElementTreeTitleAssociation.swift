extension UIElementTreeTransformation {
    // Tag 0, 0x1006586a0..0x100659a9c. Iterate the captured children, but
    // resolve indices against the progressively modified direct child array.
    static func associateTitleUIElements<Element: MutableAccessibilityNode, Context: AccessibilityRenderingContext>(
        item original: UIElementTree<Element>.Item, context: inout Context,
        rebuild: ((inout UIElementTree<Element>, UIElementTree<Element>.Item, inout Context) -> Void)? = nil,
        providerTitle: ((Element.ID) -> String?)? = nil
    ) -> Result<Element> where Element.Role == Context.Role {
        var working: UIElementTree<Element>.Item?
        for source in original.children {
            var item = working ?? original
            guard let sourceIndex = item.firstChildIndex(matching: source.element.id) else { continue }
            var seen = Set<Element.ID>()
            let targets = source.element.titleTargetIdentities.filter { seen.insert($0).inserted }
            guard !targets.isEmpty else { continue }
            if targets.count == 1,
               let text = soleTitleAssociationText(source.element),
               titleAssociationTargetLacksTitle(identity: targets[0], in: original.children,
                                                providerTitle: providerTitle),
               let targetIndex = item.firstChildIndex(matching: targets[0]) {
                // Write before removing the label, including when the target
                // precedes it. Do not trim or discard empty associated text.
                item.subtree.items[targetIndex].element.title = text
                item.subtree.items.remove(at: sourceIndex)
                working = item
                continue
            }
            // Nonempty captured source subtrees cannot become containers.
            guard source.children.isEmpty else { continue }
            let indices = targets.compactMap { item.firstChildIndex(matching: $0) }
            guard indices.count == targets.count else { continue }
            for index in indices {
                let target = item.subtree.items[index]
                if let rebuild {
                    rebuild(&item.subtree.items[sourceIndex].subtree, target, &context)
                } else {
                    item.subtree.items[sourceIndex].subtree.items.append(target)
                }
            }
            // Keep target order inside the source; remove siblings in reverse
            // index order only after all callbacks/appends have completed.
            for index in indices.sorted(by: >) { item.subtree.items.remove(at: index) }
            working = item
        }
        if let working { return .transformed(working) }
        return .unchanged
    }
}

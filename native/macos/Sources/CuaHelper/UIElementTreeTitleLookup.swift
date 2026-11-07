extension UIElementTree.Item {
    // Title-association helper 0x10065c3c0 -> firstIndex(where:), predicate
    // 0x10065c498. Match direct children's Identifiable.id, preserving first
    // occurrence. This must not use the flattened tree's numeric-ID table.
    func firstChildIndex(matching identity: Element.ID) -> Int? {
        children.firstIndex { $0.element.id == identity }
    }
}

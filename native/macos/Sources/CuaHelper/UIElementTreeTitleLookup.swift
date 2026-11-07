extension UIElementTree.Item {
    // Title-association helper 0x10065c3c0 -> firstIndex(where:), predicate
    // 0x10065c498. Match direct children's Identifiable.id, preserving first
    // occurrence. This must not use the flattened tree's numeric-ID table.
    func firstChildIndex(matching identity: Element.ID) -> Int? {
        children.firstIndex { $0.element.id == identity }
    }
}


// Extracted selection block 0x100658c84..0x100658db4, not an original public
// API. Read all three fields in source order. Exactly one non-nil field is
// required; equal strings in multiple fields are still ambiguous.
func soleTitleAssociationText<Element: AccessibilityNode>(_ element: Element) -> String? {
    let value = element.value
    let title = element.title
    let description = element.description
    switch (value, title, description) {
    case (.some(let text), .none, .none),
         (.none, .some(let text), .none),
         (.none, .none, .some(let text)):
        return text
    default:
        return nil
    }
}


// Extracted guard at 0x100658db4..0x1006590fc. Presence of the provider is
// authoritative: its nil result permits association, without consulting the
// captured child array. Only an absent provider falls back to first ID match.
func titleAssociationTargetLacksTitle<Element: AccessibilityNode>(
    identity: Element.ID, in children: [UIElementTree<Element>.Item],
    providerTitle: ((Element.ID) -> String?)? = nil
) -> Bool {
    if let providerTitle { return providerTitle(identity) == nil }
    return children.first { $0.element.id == identity }?.element.title == nil
}

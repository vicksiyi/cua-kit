import Foundation

// UIElementTreeRevision.item(for:), 0x1006557a4. Identity membership selects
// which source tree owns the stored path; a focus hit does not use its local ID
// as the lookup path and does not fall back if that path is missing there.
func revisionTreeItem<Element: AccessibilityNode>(
    for id: Int, ids: UIElementTreeTable<Element.ID, Int>,
    tree: UIElementTree<Element>, focusTree: UIElementTree<Element>?
) -> UIElementTree<Element>.Item? {
    guard let path = ids.path(to: id), let identity = ids[value: id] else { return nil }
    if var focus = focusTree, focus.id(for: identity) != nil {
        return focus.item(at: path)
    }
    return tree.item(at: path)
}

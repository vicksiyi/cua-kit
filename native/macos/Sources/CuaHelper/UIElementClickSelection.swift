// UIElementProtocol.clickingMayCauseSelection, 0x1007a7790..<0x1007a79e8.
// The last predicate means supported selection ATTRIBUTES, not selected items.
// Its original helper filters selectedRows, selectedCells, selectedChildren
// against the cache supportedAttributes set (0x1007afa64..<0x1007afd2c).
func uiElementClickingMayCauseSelection<Node>(
    _ element: Node,
    parent: @escaping (Node) -> Node?,
    role: (Node) -> UIElementRole,
    isSelectable: (Node) -> Bool,
    hasSupportedSelectionAttributes: (Node) -> Bool
) -> Bool {
    for ancestor in uiElementParentChain(of: element, maxDepth: 300,
        includingSelf: true, parent: parent) {
        if role(ancestor) == .application { return false }
        if isSelectable(ancestor) { return true }
        if hasSupportedSelectionAttributes(ancestor) { return true }
    }
    return false
}

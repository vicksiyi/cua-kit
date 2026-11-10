// Transport adapter lookup. Rendered revision IDs can start at zero and have
// gaps after diffing; their value is not a position in the exported array.
func observedNode(for id: Int, in nodes: [Node]) -> Node? {
    guard id >= 0 else { return nil }
    return nodes.first { $0.data["id"] as? Int == id }
}

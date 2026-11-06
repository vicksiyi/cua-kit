// UIElementProtocol.isInsideWebView, 0x1007ab2c4..<0x1007ab548.
// This is element classification, not browser selection or application policy.
func uiElementIsInsideWebView<Node>(
    _ element: Node,
    parent: @escaping (Node) -> Node?,
    role: (Node) -> UIElementRole,
    bundleIdentifier: (Node) -> String?
) -> Bool {
    for ancestor in uiElementParentChain(of: element, maxDepth: 300,
        includingSelf: true, parent: parent) {
        if role(ancestor) == .webArea { return true }
    }
    // Preserve prefix matching and read the original element, not the last parent.
    return bundleIdentifier(element)?.hasPrefix("com.openai.atlas") ?? false
}

// Prefix of UIElementProtocol.perform(action:), 0x100791a68..<0x100791d78,
// and ancestor invocation at 0x100791e38..<0x100791ea8.
// parentChain must supply the original maxDepth / includingSelf:false sequence.
func prepareUIElementMenuAction<Parents: Sequence>(
    _ action: UIElementAction,
    role: UIElementRole,
    parentChain: () -> Parents,
    childrenAreEmpty: (Parents.Element) -> Bool,
    actions: (Parents.Element) -> [UIElementAction],
    perform: (Parents.Element, UIElementAction) throws -> Void
) throws {
    guard role == .menuItem else { return }
    // Original materializes this prefix before inspecting any ancestor actions.
    var candidates: [Parents.Element] = []
    for parent in parentChain() {
        guard childrenAreEmpty(parent) else { break }
        candidates.append(parent)
    }
    for parent in candidates {
        if actions(parent).contains(action) {
            try perform(parent, action)
            return
        }
    }
}

// Complete branch ordering with original protocol boundaries injected. The
// ancestor perform remains the original witness, not a raw AX substitution.
func dispatchUIElementAction<Parents: Sequence>(
    _ action: UIElementAction,
    role: UIElementRole,
    parentChain: () -> Parents,
    childrenAreEmpty: (Parents.Element) -> Bool,
    actions: (Parents.Element) -> [UIElementAction],
    performAncestor: (Parents.Element, UIElementAction) throws -> Void,
    toggleDisclosure: () throws -> Void,
    scrollUsingScrollBar: (UIElementScrollDirection) throws -> Bool,
    performAXAction: (UIElementAction) throws -> Void
) throws {
    try prepareUIElementMenuAction(action, role: role, parentChain: parentChain,
        childrenAreEmpty: childrenAreEmpty, actions: actions, perform: performAncestor)
    try dispatchUIElementActionAfterMenuPreparation(action,
        toggleDisclosure: toggleDisclosure, scrollUsingScrollBar: scrollUsingScrollBar,
        performAXAction: performAXAction)
}

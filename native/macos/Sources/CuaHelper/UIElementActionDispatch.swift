// Original direction mapper: 0x100728f34..<0x1007290bc.
// Case order follows the native discriminants (up/down/left/right = 0/1/2/3).
enum UIElementScrollDirection: Equatable {
    case up, down, left, right

    init?(action: UIElementAction) {
        // These are mutable action constants. Preserve ordered comparisons,
        // including first-match behavior if callers replace them with aliases.
        if action == .scrollUpByPage { self = .up }
        else if action == .scrollDownByPage { self = .down }
        else if action == .scrollLeftByPage { self = .left }
        else if action == .scrollRightByPage { self = .right }
        else { return nil }
    }
}

// The tail of UIElementProtocol.perform(action:), 0x100791d78..<0x100791f24.
// Caller must first complete the original menu-ancestor preparation. Keeping
// that precondition explicit avoids presenting this as the full entry point.
func dispatchUIElementActionAfterMenuPreparation(
    _ action: UIElementAction,
    toggleDisclosure: () throws -> Void,
    scrollUsingScrollBar: (UIElementScrollDirection) throws -> Bool,
    performAXAction: (UIElementAction) throws -> Void
) throws {
    if action == .expand || action == .collapse {
        try toggleDisclosure()
        return
    }
    if let direction = UIElementScrollDirection(action: action) {
        if try scrollUsingScrollBar(direction) { return }
    }
    try performAXAction(action)
}

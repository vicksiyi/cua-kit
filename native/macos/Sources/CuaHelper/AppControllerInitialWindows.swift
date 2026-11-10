// Controller initialization 0x10006cc34..0x10006d274. Register the selected
// primary window, then breadth-first scan its descendants for sheets. The
// primary itself is not role-tested; duplicates and child order are preserved.
// This is not an enumeration of every application AXWindows entry.
func registerAppControllerInitialWindows<Window, Element>(primaryWindow: () -> Window?,
    registerWindow: (Window) -> Void, windowChildren: (Window) -> [Element],
    isSheet: (Element) -> Bool, registerSheet: (Element) -> Void,
    children: (Element) -> [Element], checkpoint: () throws -> Void) rethrows {
    try checkpoint()
    guard let primary = primaryWindow() else { return }
    registerWindow(primary)
    var pending = windowChildren(primary)
    while !pending.isEmpty {
        try checkpoint()
        let element = pending.removeFirst()
        if isSheet(element) { registerSheet(element) }
        pending.append(contentsOf: children(element))
    }
}

// Original nonthrowing orchestration remains available without a host checkpoint.
func registerAppControllerInitialWindows<Window, Element>(primaryWindow: () -> Window?,
    registerWindow: (Window) -> Void, windowChildren: (Window) -> [Element],
    isSheet: (Element) -> Bool, registerSheet: (Element) -> Void,
    children: (Element) -> [Element]) {
    registerAppControllerInitialWindows(primaryWindow: primaryWindow,
        registerWindow: registerWindow, windowChildren: windowChildren,
        isSheet: isSheet, registerSheet: registerSheet, children: children, checkpoint: {})
}

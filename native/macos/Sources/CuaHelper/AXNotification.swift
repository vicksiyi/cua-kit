import ApplicationServices

// Native notification identity is its CFString, distinct from AX attributes.
struct AXNotification: Hashable {
    let name: CFString
    init(_ name: CFString) { self.name = name }
    init(_ name: String) { self.name = name as CFString }
    static func == (lhs: Self, rhs: Self) -> Bool { lhs.name == rhs.name }
    func hash(into hasher: inout Hasher) { name.hash(into: &hasher) }

    static let windowCreated = AXNotification(kAXWindowCreatedNotification)
    static let focusedWindowChanged = AXNotification(kAXFocusedWindowChangedNotification)
    static let uiElementDestroyed = AXNotification(kAXUIElementDestroyedNotification)
    static let menuOpened = AXNotification(kAXMenuOpenedNotification)
    static let sheetCreated = AXNotification(kAXSheetCreatedNotification)
    static let windowMoved = AXNotification(kAXWindowMovedNotification)
    static let windowResized = AXNotification(kAXWindowResizedNotification)
    static let menuClosed = AXNotification(kAXMenuClosedNotification)
}

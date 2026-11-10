import AppKit

// Native designated initializer 0x1000943c8..0x100094448. Selector is supplied
// by the concrete Window owner; the native selector is activeSpaceDidChange:.
@MainActor
func installCursorWindowNotifications(_ window: NSWindow & NSWindowDelegate, selector: Selector) {
    window.delegate = window
    NSWorkspace.shared.notificationCenter.addObserver(window, selector: selector,
        name: NSWorkspace.activeSpaceDidChangeNotification, object: nil)
}

// Native deinit 0x100094498 removes this observer from the workspace center.
// It does not clear the delegate or remove the display driver in this phase.
@MainActor
func removeCursorWindowNotifications(_ window: NSWindow) {
    NSWorkspace.shared.notificationCenter.removeObserver(window)
}

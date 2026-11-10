// Compile with CursorWindowAppearance.swift, CursorWindowNotifications.swift,
// and CursorWindowScreenChange.swift.
// Owned offscreen AppKit check: never orders a window or sends input.
import AppKit

// Fixture for the style boundary; production style/image rendering is tested
// separately. The actual restored AppKit setup functions are compiled unchanged.
@MainActor class ComputerUseCursorStyle {
    let view = NSView(frame: NSRect(x: 0, y: 0, width: 20, height: 23))
    var makeViewCalls = 0
    func makeView() -> NSView { makeViewCalls += 1; return view }
}

@MainActor final class OwnedWindow: NSWindow, NSWindowDelegate {
    var notifications = 0
    var screenResets = 0
    var observedScreen: NSScreen?
    override var screen: NSScreen? { observedScreen }
    func windowDidChangeScreen(_ notification: Notification) {
        cursorWindowDidChangeScreen(self) { screenResets += 1 }
    }
    @objc func activeSpaceDidChange(_ notification: Notification) { notifications += 1 }
}

@main
struct CursorWindowNotificationCheck {
    @MainActor static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.prohibited)
        let window = OwnedWindow(contentRect: .zero, styleMask: .borderless, backing: .buffered, defer: true)
        let style = ComputerUseCursorStyle()
        configureCursorWindowAppearance(window, style: style)
        precondition(!window.isVisible && window.title == "Software Cursor")
        precondition(window.collectionBehavior.rawValue == 0x40048)
        precondition(!window.isReleasedWhenClosed && window.ignoresMouseEvents)
        precondition(window.contentViewController?.view === style.view)
        precondition(style.view.wantsLayer && style.makeViewCalls == 1)
        precondition(window.backgroundColor == .clear)
        installCursorWindowNotifications(window, selector: #selector(OwnedWindow.activeSpaceDidChange(_:)))
        precondition(window.delegate === window)
        let center = NSWorkspace.shared.notificationCenter
        center.post(name: NSWorkspace.activeSpaceDidChangeNotification, object: nil)
        precondition(window.notifications == 1)
        removeCursorWindowNotifications(window)
        center.post(name: NSWorkspace.activeSpaceDidChangeNotification, object: nil)
        precondition(window.notifications == 1 && !window.isVisible)
        // Use the actual delegate entry point with controlled screen association.
        // This verifies branching, not delivery of a physical display change.
        window.observedScreen = nil
        window.windowDidChangeScreen(Notification(name: NSWindow.didChangeScreenNotification, object: window))
        precondition(window.screenResets == 1)
        if let screen = NSScreen.screens.first {
            window.observedScreen = screen
            window.windowDidChangeScreen(Notification(name: NSWindow.didChangeScreenNotification, object: window))
            precondition(window.screenResets == 1)
        } else {
            preconditionFailure("Present-screen branch needs an actual NSScreen")
        }
        window.close()
        print("Owned offscreen window: appearance, delegate, notification delivery/removal, screen-loss reset branch passed; fixture style; no ordering/input")
    }
}

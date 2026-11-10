import AppKit
import os

// Window.windowDidChangeScreen, native 0x10009ae94. A screen change does not
// always reset motion: only loss of the window's screen takes the reset path.
@MainActor
func cursorWindowDidChangeScreen(_ window: NSWindow, reset: () -> Void) {
    guard window.screen == nil else { return }
    Logger(subsystem: "core.cua", category: "ComputerUseCursor")
        .debug("log[5036a4a96c084473b68e]")
    reset()
}

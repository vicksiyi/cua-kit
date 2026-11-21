import AppKit
import ScreenCaptureKit

@main struct Check {
    @MainActor static func main() async throws {
        NSApplication.shared.setActivationPolicy(.prohibited)
        let window = NSWindow(contentRect: NSRect(x: -20000, y: -20000, width: 320, height: 240),
            styleMask: [.titled, .miniaturizable], backing: .buffered, defer: false)
        window.title = "Owned offscreen capture regression"
        window.orderFront(nil)
        window.setFrameOrigin(NSPoint(x: -20000, y: -20000))
        window.miniaturize(nil)
        defer { window.orderOut(nil) }
        try await Task.sleep(nanoseconds: 200_000_000)
        let id = UInt32(window.windowNumber)
        let visible = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
        precondition(!visible.windows.contains { $0.windowID == id }, "Fixture must be offscreen")
        let capture = try await applicationCaptureContent(processID: getpid())
        precondition(capture.windows.contains { $0.windowID == id }, "No capturable window belongs to this application.")
        precondition(capture.windows.allSatisfy { $0.owningApplication?.processID == getpid() })
        print("PASS: owned offscreen window is included and other applications are excluded")
    }
}

import AppKit
import SystemSoftware

// Native window-number boundary uses AppKit, not a rectangle scan through
// CGWindowList. Full window description decoding remains with the caller.
func systemMouseWindowNumber(at point: CGPoint, belowWindowID: UInt32 = 0) -> UInt32? {
    mouseWindowAtPoint(point, belowWindowID: belowWindowID, screens: NSScreen.screens,
        frame: { $0.frame }, windowNumber: {
            NSWindow.windowNumber(at: $0, belowWindowWithWindowNumber: $1)
        }, lookupWindow: { $0 })
}

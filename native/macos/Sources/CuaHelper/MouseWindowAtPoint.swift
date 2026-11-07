import AppKit

// CGWindow.window(at:belowWindowID:), 0x10025ba5c..0x10025bc94.
// Preserve caller screen order, NSMouseInRect(flipped:false), the second frame
// read and the source's height-minus-y conversion (no origin adjustment).
func mouseWindowAtPoint<Screen, Window>(_ point: CGPoint, belowWindowID: UInt32,
    screens: [Screen], frame: (Screen) -> CGRect,
    windowNumber: (CGPoint, Int) -> Int, lookupWindow: (UInt32) -> Window?) -> Window? {
    for screen in screens {
        if NSMouseInRect(point, frame(screen), false) {
            let converted = CGPoint(x: point.x, y: frame(screen).height - point.y)
            // Native code traps for negative or out-of-UInt32 AppKit results.
            let id = UInt32(windowNumber(converted, Int(belowWindowID)))
            return lookupWindow(id)
        }
    }
    return nil
}

// Native window-number boundary uses AppKit, not a rectangle scan through
// CGWindowList. Full window description decoding remains with the caller.
func systemMouseWindowNumber(at point: CGPoint, belowWindowID: UInt32 = 0) -> UInt32? {
    mouseWindowAtPoint(point, belowWindowID: belowWindowID, screens: NSScreen.screens,
        frame: { $0.frame }, windowNumber: {
            NSWindow.windowNumber(at: $0, belowWindowWithWindowNumber: $1)
        }, lookupWindow: { $0 })
}

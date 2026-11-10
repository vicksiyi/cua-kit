#if canImport(SystemSoftware)
import SystemSoftware
#endif
import AppKit
import CoreGraphics

// Native 0x10009a880. Write the reason before effects; a pet launch retains
// overlay ownership when the monitored app becomes inactive.
func updateCursorAppMonitorOverlay(_ enabled: Bool,
    reasons: () -> CursorOverlayWindowLevelReasons,
    setAppMonitorReason: (Bool) -> Void,
    promote: () -> Void, setLevel: (Int) -> Void, updateVisibility: () -> Void
) {
    let previous = reasons()
    guard previous.appMonitor != enabled else { return }
    setAppMonitorReason(enabled)
    if enabled {
        if !previous.appMonitor && !previous.petLaunch { promote() }
    } else if previous.appMonitor && !previous.petLaunch {
        setLevel(0)
    }
    updateVisibility()
}

@MainActor
func promoteCursorWindowOverlay(_ window: NSWindow) {
    let number = window.windowNumber
    if number >= 1 {
        // Native traps if a positive NSWindow number does not fit UInt32.
        let level = CGWindowLevelForKey(CGWindowLevelKey(rawValue: 15)!)
        let id = UInt32(number)
        _ = WindowServerSPI.setWindowLevel(level, forWindow: id,
            connection: WindowServerSPI.mainConnectionID())
    }
    window.level = NSWindow.Level(rawValue: 102)
}

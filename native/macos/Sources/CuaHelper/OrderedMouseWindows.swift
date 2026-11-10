import CoreGraphics

// ComputerUseAppController.orderedWindows(), 0x100082100..0x1000823f4.
// Capture the controller map BEFORE querying WindowServer, then compact-map
// in WindowServer order. No focused/captured/AX-array-order fallback exists.
func orderedMouseWindows<Window>(windows: () -> [UInt32: Window],
    orderedWindowIDs: () -> [UInt32]) -> [Window] {
    let known = windows()
    return orderedWindowIDs().compactMap { known[$0] }
}

// Controller.windows getter, 0x100086068 / filter 0x10008548c: validate by
// the window's throwing AX ID read, NOT geometry, role, PID or native presence.
// Keep the stored key even if that read returns a different nonzero ID.
func pruneMouseWindows<Window>(_ windows: inout [UInt32: Window],
    accessibilityWindowID: (Window) throws -> UInt32,
    observedWindowIDsChanged: ([UInt32]) -> Void) {
    let valid = windows.filter { (try? accessibilityWindowID($0.value)) ?? 0 != 0 }
    guard valid.count != windows.count else { return }
    windows = valid
    observedWindowIDsChanged(Array(windows.keys))
}

// Window registration 0x100085730: ID errors are discarded. Successful zero
// IDs are inserted too (the getter's pruning later removes them). Replacement
// at an existing key still updates the observed-ID list.
func registerMouseWindow<Window>(_ window: Window, windows: inout [UInt32: Window],
    windowID: (Window) throws -> UInt32, observedWindowIDsChanged: ([UInt32]) -> Void) {
    guard let id = try? windowID(window) else { return }
    windows[id] = window
    observedWindowIDsChanged(Array(windows.keys))
}

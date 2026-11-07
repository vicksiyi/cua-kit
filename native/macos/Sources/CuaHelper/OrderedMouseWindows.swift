import CoreGraphics
import Darwin

// ComputerUseAppController.orderedWindows(), 0x100082100..0x1000823f4.
// Capture the controller map BEFORE querying WindowServer, then compact-map
// in WindowServer order. No focused/captured/AX-array-order fallback exists.
func orderedMouseWindows<Window>(windows: () -> [UInt32: Window],
    orderedWindowIDs: () -> [UInt32]) -> [Window] {
    let known = windows()
    return orderedWindowIDs().compactMap { known[$0] }
}

// CGWindowListCreate returns numeric window IDs stored as pointer-sized CFArray
// entries, not CFNumber objects. Match the original 0x11 options and zero
// relative ID; missing list means an empty ordering, not an enumeration error.
func onScreenMouseWindowIDs(
    createList: (CGWindowListOption, CGWindowID) -> CFArray? = createOnScreenMouseWindowList
) -> [UInt32] {
    guard let list = createList([.optionOnScreenOnly, .excludeDesktopElements], 0) else { return [] }
    return (0..<CFArrayGetCount(list)).map {
        UInt32(UInt(bitPattern: CFArrayGetValueAtIndex(list, $0)))
    }
}

// The public C symbol is marked unavailable by the Swift SDK importer. Bind
// that same C API rather than substituting CGWindowListCopyWindowInfo, whose
// returned values and ownership are different.
private typealias CreateMouseWindowList = @convention(c) (UInt32, UInt32) -> Unmanaged<CFArray>?
private let createMouseWindowList: CreateMouseWindowList = {
    let symbol = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CGWindowListCreate")!
    return unsafeBitCast(symbol, to: CreateMouseWindowList.self)
}()
func createOnScreenMouseWindowList(_ options: CGWindowListOption, _ relative: CGWindowID) -> CFArray? {
    createMouseWindowList(options.rawValue, relative)?.takeRetainedValue()
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

import ApplicationServices
import CoreGraphics

// MenuUIElement.windowID, 0x100725a5c. The raw AX window may be an
// application window; select the first same-process menu-level native window
// above it. Do not fall back to returning that raw AX ID on failure.
enum MenuWindowIDError: Error { case menuWindowNotFound }
func resolveMenuWindowID<Window>(actualPID: () throws -> Int32,
    accessibilityWindowID: () throws -> UInt32,
    allWindows: (CGWindowListOption, UInt32) -> [Window],
    ownerPID: (Window) -> Int32, level: (Window) -> Int32,
    windowID: (Window) -> UInt32) throws -> UInt32 {
    let pid = try actualPID()
    let relative = try accessibilityWindowID()
    let windows = allWindows([.optionOnScreenAboveWindow, .excludeDesktopElements], relative)
    for window in windows where ownerPID(window) == pid {
        let value = level(window)
        if value == 101 || value == 24 { return windowID(window) }
    }
    throw MenuWindowIDError.menuWindowNotFound
}

func systemMenuWindowID(_ element: AXUIElement) throws -> UInt32 {
    try resolveMenuWindowID(actualPID: { try element.actualPID },
        accessibilityWindowID: { try element.windowID }, allWindows: { options, relative in
            let rows = CGWindowListCopyWindowInfo(options, relative) as? [[String: Any]] ?? []
            return rows.map(NativeWindowDescription.init)
        }, ownerPID: { $0.ownerPID }, level: { $0.level }, windowID: { $0.id })
}

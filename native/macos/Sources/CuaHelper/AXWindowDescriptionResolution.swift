import CoreGraphics

// Native0x10071f560..0x10071f594: ID failure or missing CG description
// proceeds to the original fallback; neither is an immediate terminal error.
func resolveAXWindowDescription(readWindowID: () throws -> UInt32,
    lookupWindow: (UInt32) -> NativeWindowDescription?,
    fallback: () -> NativeWindowDescription?
) -> NativeWindowDescription? {
    if let id = try? readWindowID(), let window = lookupWindow(id) { return window }
    return fallback()
}

// Ordinary (non-desktop) fallback0x10071fe90..0x1007203a4. Retain source
// enumeration order and exact CGRect equality, rather than capture tolerances.
// Multiple geometry matches are narrowed by a nonnil exact window title. If
// several title matches remain, report ambiguity and return the first one.
func matchAXWindowDescription(_ windows: [NativeWindowDescription], processID: Int32,
    frame: CGRect, title: String, reportAmbiguity: (Int) -> Void
) -> NativeWindowDescription? {
    let candidates = windows.filter { $0.ownerPID == processID && $0.bounds == frame }
    if candidates.count < 2 { return candidates.first }
    let titled = candidates.filter { $0.name == title }
    if titled.count > 1 { reportAmbiguity(titled.count) }
    return titled.first
}

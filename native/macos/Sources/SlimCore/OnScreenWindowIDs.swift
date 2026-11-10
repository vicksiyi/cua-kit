import CoreGraphics
import Darwin

// CGWindowListCreate returns numeric window IDs stored as pointer-sized CFArray
// entries, not CFNumber objects. Match the original 0x11 options and zero
// relative ID; missing list means an empty ordering, not an enumeration error.
public func onScreenMouseWindowIDs(
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
public func createOnScreenMouseWindowList(_ options: CGWindowListOption, _ relative: CGWindowID) -> CFArray? {
    createMouseWindowList(options.rawValue, relative)?.takeRetainedValue()
}


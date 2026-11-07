import Foundation
import CoreGraphics
import AppKit

// Window description boundary 0x10025c904. Numeric IDs are pointer-sized
// entries in a nonretaining CFArray, not CFNumber values.
func nativeWindowDescription(_ id: UInt32,
    descriptions: (CFArray) -> [[String: Any]]? = { CGWindowListCreateDescriptionFromArray($0) as? [[String: Any]] }) -> [String: Any]? {
    guard id != 0 else { return nil }
    var item = UnsafeRawPointer(bitPattern: UInt(id))
    let ids = CFArrayCreate(nil, &item, 1, nil)!
    return descriptions(ids)?.first
}

// Source CGWindow payload initializer 0x10025c488. Number is required (forced
// UInt32 cast); optional/malformed metadata uses the source defaults.
struct NativeWindowDescription {
    let id: UInt32
    let ownerPID: Int32
    let bounds: CGRect
    let level: Int32
    let name: String?
    let ownerName: String?
    let isOnscreen: Bool?
    init(_ description: [String: Any]) {
        id = description[kCGWindowNumber as String] as! UInt32
        ownerPID = description[kCGWindowOwnerPID as String] as? Int32 ?? -1
        if let dictionary = description[kCGWindowBounds as String] as? [String: Any] {
            bounds = CGRect(dictionaryRepresentation: dictionary as CFDictionary) ?? .zero
        } else { bounds = .zero }
        level = description[kCGWindowLayer as String] as? Int32 ?? 0
        name = description[kCGWindowName as String] as? String
        ownerName = description[kCGWindowOwnerName as String] as? String
        isOnscreen = description[kCGWindowIsOnscreen as String] as? Bool
    }
}

func systemNativeWindowDescription(_ id: UInt32) -> NativeWindowDescription? {
    nativeWindowDescription(id).map(NativeWindowDescription.init)
}

func systemNativeWindow(at point: CGPoint, belowWindowID: UInt32 = 0) -> NativeWindowDescription? {
    mouseWindowAtPoint(point, belowWindowID: belowWindowID, screens: NSScreen.screens,
        frame: { $0.frame }, windowNumber: { NSWindow.windowNumber(at: $0, belowWindowWithWindowNumber: $1) },
        lookupWindow: systemNativeWindowDescription)
}

import Foundation
import CoreGraphics

// Window description boundary 0x10025c904. Numeric IDs are pointer-sized
// entries in a nonretaining CFArray, not CFNumber values.
public func nativeWindowDescription(_ id: UInt32,
    descriptions: (CFArray) -> [[String: Any]]? = { CGWindowListCreateDescriptionFromArray($0) as? [[String: Any]] }) -> [String: Any]? {
    guard id != 0 else { return nil }
    var item = UnsafeRawPointer(bitPattern: UInt(id))
    let ids = CFArrayCreate(nil, &item, 1, nil)!
    return descriptions(ids)?.first
}

// Source CGWindow payload initializer 0x10025c488. Number is required (forced
// UInt32 cast); optional/malformed metadata uses the source defaults.
public struct CGWindow {
    public let id: UInt32
    public let ownerPID: Int32
    public let bounds: CGRect
    public let level: Int32
    public let name: String?
    public let ownerName: String?
    public let isOnscreen: Bool?
    public init(_ description: [String: Any]) {
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

public extension CGWindow {
    // Exported original entry25b818 delegates to description helper25c904.
    static func window(for id: UInt32) -> CGWindow? {
        nativeWindowDescription(id).map(CGWindow.init)
    }
}

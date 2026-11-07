import Foundation
import CoreGraphics
import AppKit

// 0x10025c904 creates a nonretaining CFArray containing the numeric window ID
// as a pointer-sized entry, then calls CGWindowListCreateDescriptionFromArray.
// This adapter extracts only owner PID needed by the external-click callback.
func syntheticFocusWindowOwnerPID(_ id: UInt32) -> Int32? {
    guard id != 0 else { return nil }
    var item = UnsafeRawPointer(bitPattern: UInt(id))
    let ids = CFArrayCreate(nil, &item, 1, nil)!
    guard let rows = CGWindowListCreateDescriptionFromArray(ids) as? [[String: Any]],
          let first = rows.first,
          let owner = first[kCGWindowOwnerPID as String] as? NSNumber else { return nil }
    return owner.int32Value
}

func activateSyntheticFocusClickApplication(_ pid: Int32) {
    // Source uses NSRunningApplication followed by activate(options: 0).
    _ = NSRunningApplication(processIdentifier: pid)?.activate(options: [])
}

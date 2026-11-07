import Foundation
import CoreGraphics

struct SafeActivationOrderedWindow {
    let id: UInt32
    let ownerPID: Int32
    let layer: Int32
}

// 0x10074265c..0x100742784: CGWindow list options 0x11, saved-window
// index, then only preceding target-owned windows at that same layer.
func restoreSafeActivationWindowOrder(
    savedWindowID: UInt32?, targetPID: Int32,
    windows: () -> [SafeActivationOrderedWindow],
    raiseSavedWindow: (() throws -> Void)?
) throws -> Bool {
    guard let savedWindowID else { return false }
    let ordered = windows()
    guard let savedIndex = ordered.firstIndex(where: { $0.id == savedWindowID }), savedIndex > 0 else { return false }
    let savedLayer = ordered[savedIndex].layer
    guard ordered[..<savedIndex].contains(where: { $0.ownerPID == targetPID && $0.layer == savedLayer }) else { return false }
    try raiseSavedWindow?()
    // The native loop still resets quiet time / polls if no AX window exists.
    return true
}

func safeActivationOnScreenWindows() -> [SafeActivationOrderedWindow] {
    guard let rows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], 0) as? [[String: Any]] else { return [] }
    return rows.compactMap { row in
        guard let id = row[kCGWindowNumber as String] as? NSNumber,
              let pid = row[kCGWindowOwnerPID as String] as? NSNumber,
              let layer = row[kCGWindowLayer as String] as? NSNumber else { return nil }
        return SafeActivationOrderedWindow(id: id.uint32Value, ownerPID: pid.int32Value, layer: layer.int32Value)
    }
}

import SystemSoftware
import Foundation
import CoreGraphics

// 0x10074265c..0x100742784: CGWindow list options 0x11, saved-window
// index, then only preceding target-owned windows at that same layer.
func restoreSafeActivationWindowOrder(
    savedWindowID: UInt32?, targetPID: Int32,
    windows: () -> [CGWindow],
    raiseSavedWindow: (() throws -> Void)?
) throws -> Bool {
    guard let savedWindowID else { return false }
    let ordered = windows()
    guard let savedIndex = ordered.firstIndex(where: { $0.id == savedWindowID }), savedIndex > 0 else { return false }
    let savedLayer = ordered[savedIndex].level
    guard ordered[..<savedIndex].contains(where: { $0.ownerPID == targetPID && $0.level == savedLayer }) else { return false }
    try raiseSavedWindow?()
    // The native loop still resets quiet time / polls if no AX window exists.
    return true
}

func safeActivationOnScreenWindows() -> [CGWindow] {
    CGWindow.allWindows([.optionOnScreenOnly, .excludeDesktopElements], relativeToWindow: 0)
}

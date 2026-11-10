import Foundation
import CoreGraphics
import SystemSoftware

func require(_ condition: Bool) { precondition(condition) }

@main struct Check {
    final class Failure: Error {}
    static func main() throws {
        // Original CGWindow decoder keeps a saved window with optional PID/layer
        // missing; previous compactMap dropped it and prevented restoration.
        let rows: CFArray = [
            [kCGWindowNumber as String: UInt32(1), kCGWindowOwnerPID as String: Int32(88), kCGWindowLayer as String: Int32(0)],
            [kCGWindowNumber as String: UInt32(2)]
        ] as CFArray
        let windows = CGWindow.allWindows([.optionOnScreenOnly, .excludeDesktopElements], relativeToWindow: 0,
            copyWindowInfo: { _, _ in rows })
        precondition(windows.count == 2 && windows[1].ownerPID == -1 && windows[1].level == 0)
        var raises = 0
        let restored = try restoreSafeActivationWindowOrder(savedWindowID: 2, targetPID: 88,
            windows: { windows }, raiseSavedWindow: { raises += 1 })
        precondition(restored && raises == 1)
        try require(!restoreSafeActivationWindowOrder(savedWindowID: nil, targetPID: 88,
            windows: { preconditionFailure("enumerated without saved ID") }, raiseSavedWindow: nil))
        try require(!restoreSafeActivationWindowOrder(savedWindowID: 1, targetPID: 88,
            windows: { windows }, raiseSavedWindow: { preconditionFailure("raised first window") }))
        try require(restoreSafeActivationWindowOrder(savedWindowID: 2, targetPID: 88,
            windows: { windows }, raiseSavedWindow: nil))
        let higher = CGWindow([kCGWindowNumber as String: UInt32(3), kCGWindowOwnerPID as String: Int32(88),
            kCGWindowLayer as String: Int32(1)])
        try require(!restoreSafeActivationWindowOrder(savedWindowID: 2, targetPID: 88,
            windows: { [higher, windows[1]] }, raiseSavedWindow: nil))
        let failure = Failure()
        do {
            _ = try restoreSafeActivationWindowOrder(savedWindowID: 2, targetPID: 88,
                windows: { windows }, raiseSavedWindow: { throw failure })
            preconditionFailure("raise failure swallowed")
        } catch { precondition(error as AnyObject === failure) }
        print("Safe activation original CGWindow/default/order checks passed; no native enumeration or raise")
    }
}

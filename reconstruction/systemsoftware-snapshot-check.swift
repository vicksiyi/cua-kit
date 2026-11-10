import CoreGraphics
import ScreenCaptureKit
import SystemSoftware

@main struct Check {
    final class Failure: Error {}
    static func main() async throws {
        var scaleReads = 0
        let size = cgWindowBackingSnapshotDimensions(bounds: CGRect(x: 0, y: 0, width: 2.25, height: 1.5),
            scale: { scaleReads += 1; return scaleReads == 1 ? 2 : 3 })
        precondition(size.width == 5 && size.height == 5 && scaleReads == 2)
        let clamped = cgWindowBackingSnapshotDimensions(bounds: .zero, scale: { -2 })
        precondition(clamped.width == 1 && clamped.height == 1)
        var changes: [String] = []
        func dimensions(_ width: Int, _ height: Int, _ frame: CGSize) {
            configureCGWindowSnapshotDimensions(width: width, height: height, frameSize: frame,
                setWidth: { changes.append("w \($0)") }, setHeight: { changes.append("h \($0)") })
        }
        dimensions(7, 9, .zero)
        precondition(changes == ["w 7", "h 9"])
        changes = []; dimensions(0, 100, CGSize(width: 300, height: 200))
        precondition(changes == ["w 150", "h 100"])
        changes = []; dimensions(1, 0, CGSize(width: 3, height: 1))
        precondition(changes == ["w 1"])
        changes = []; dimensions(-1, 0, .zero)
        precondition(changes.isEmpty)
        let defaults = SCStreamConfiguration()
        let configuration = cgWindowSnapshotConfiguration(width: 0, height: 0, frameSize: .zero)
        precondition(configuration.ignoreShadowsSingleWindow && configuration.ignoreShadowsDisplay)
        precondition(configuration.width == defaults.width && configuration.height == defaults.height)
        precondition(configuration.showsCursor == defaults.showsCursor && configuration.shouldBeOpaque == defaults.shouldBeOpaque)
        var calls: [String] = []
        let first: String? = try await captureCGWindowSnapshot(windowID: 7,
            acquireWindows: { calls.append("acquire"); return [7, 7, 9] },
            identify: { calls.append("id \($0)"); return UInt32($0) },
            capture: { value in calls.append("capture"); return "\(value)" })
        precondition(first == "7" && calls == ["acquire", "id 7", "capture"])
        let missing: String? = try await captureCGWindowSnapshot(windowID: 99,
            acquireWindows: { [7] }, identify: { UInt32($0) },
            capture: { _ in preconditionFailure("capture without match") })
        precondition(missing == nil)
        let failure = Failure()
        do {
            let _: Int? = try await captureCGWindowSnapshot(windowID: 7,
                acquireWindows: { throw failure }, identify: { (value: UInt32) in value }, capture: { _ in 1 })
            preconditionFailure("Missing acquisition failure")
        } catch { precondition(error as AnyObject === failure) }
        var captureAttempts = 0
        do {
            let _: Int? = try await captureCGWindowSnapshot(windowID: 7,
                acquireWindows: { [UInt32(7), 7] }, identify: { $0 },
                capture: { _ in captureAttempts += 1; throw failure })
            preconditionFailure("Missing capture failure")
        } catch { precondition(error as AnyObject === failure && captureAttempts == 1) }
        print("SystemSoftware snapshot dimension/routing checks passed; no screen capture")
    }
}

func checkOriginalSnapshotAPIs(_ window: CGWindow) async throws {
    let _: CGFloat = window.scale
    let _ = window.screen
    let _: CGImage? = try await window.snapshotAtBackingSize()
    let _: CGImage? = try await window.snapshot(width: 0, height: 10)
}

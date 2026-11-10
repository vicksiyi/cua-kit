import Foundation
// Link-only stub for the real SDK wrapper. Synthetic acquisition must not call it.
func onScreenMouseWindowIDs() -> [UInt32] { preconditionFailure("No desktop inventory in fixture") }

@main struct Check {
    final class FixtureError: Error {}
    static func main() async throws {
        let cases: [(Bool, Bool, [UInt32]?, ScreenshotContentScope, Int)] = [
            (false, true, nil, .onScreenExcludingDesktop, 0),
            (false, true, [], .onScreenExcludingDesktop, 1),
            (false, true, [1, 1], .onScreenExcludingDesktop, 1),
            (false, true, [1, 2], .all, 1),
            (true, true, [2], .currentProcess, 0),
            (true, false, nil, .all, 0),
        ]
        for (current, supported, ids, expected, reads) in cases {
            var inventoryReads = 0, acquisitions = 0
            let result = try await acquireScreenshotContent(currentProcessOnly: current,
                supportsCurrentProcess: supported, includedWindowIDs: ids,
                visibleWindowIDs: { inventoryReads += 1; return [1] },
                acquire: { scope in acquisitions += 1; precondition(scope == expected); return 42 })
            precondition(result == 42 && inventoryReads == reads && acquisitions == 1)
        }
        let failure = FixtureError()
        var attempts = 0
        do {
            let _: Int = try await acquireScreenshotContent(currentProcessOnly: false,
                supportsCurrentProcess: true, includedWindowIDs: nil,
                visibleWindowIDs: { preconditionFailure("nil IDs must not enumerate") },
                acquire: { _ in attempts += 1; throw failure })
            preconditionFailure("Capture acquisition must fail")
        } catch { precondition(error as AnyObject === failure && attempts == 1) }
        print("Screenshot content acquisition checks passed")
    }
}

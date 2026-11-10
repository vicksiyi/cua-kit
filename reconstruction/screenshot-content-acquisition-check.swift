import Foundation
import CoreGraphics

@main struct Check {
    final class FixtureError: Error {}
    static func main() async throws {
        var inventoryCalls = 0
        let emptyIDs = onScreenMouseWindowIDs(createList: { options, relative in
            precondition(options.rawValue == 0x11 && relative == 0)
            inventoryCalls += 1; return nil
        })
        precondition(emptyIDs.isEmpty && inventoryCalls == 1)
        var entries: [UnsafeRawPointer?] = [UnsafeRawPointer(bitPattern: 7), nil,
            UnsafeRawPointer(bitPattern: UInt(UInt32.max)), UnsafeRawPointer(bitPattern: 7)]
        let array = CFArrayCreate(nil, &entries, entries.count, nil)!
        precondition(onScreenMouseWindowIDs(createList: { _, _ in array }) == [7, 0, UInt32.max, 7])
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

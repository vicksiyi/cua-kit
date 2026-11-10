import Foundation
import CoreGraphics

public extension CGWindow {
    // Original25b8e8..25ba5c uses CopyWindowInfo, not numeric-ID ListCreate.
    static func allWindows(_ options: CGWindowListOption, relativeToWindow id: UInt32) -> [CGWindow] {
        allWindows(options, relativeToWindow: id, copyWindowInfo: CGWindowListCopyWindowInfo)
    }

    // Extracted injection boundary. Whole-array conditional bridging precedes
    // mapping; malformed entries do not silently yield a partial window list.
    static func allWindows(_ options: CGWindowListOption, relativeToWindow id: UInt32,
        copyWindowInfo: (CGWindowListOption, CGWindowID) -> CFArray?
    ) -> [CGWindow] {
        guard let rows = copyWindowInfo(options, id) as? [[String: Any]] else { return [] }
        return rows.map(CGWindow.init)
    }
}

import Foundation
import ScreenCaptureKit

private struct ScreenshotAppWindowRecord {
    let windowID: UInt32
    let appName: String
    let title: String?
}

// 0x100fb763c..0x100fb7bfc. App-name selection only considers on-screen
// candidates, even when the shareable content contains off-screen windows.
public func screenshotWindow(matching appName: String, in content: SCShareableContent) -> SCWindow? {
    let onScreenWindows = content.windows.filter { $0.isOnScreen }
    var records: [ScreenshotAppWindowRecord] = []
    for window in onScreenWindows {
        guard let app = window.owningApplication else { continue }
        let name = app.applicationName.lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { continue }
        records.append(ScreenshotAppWindowRecord(windowID: window.windowID,
            appName: name, title: window.title))
    }
    guard let selected = matchingScreenshotAppWindow(in: records, appName: appName,
        applicationName: { $0.appName }) else { return nil }
    // Source reads content.windows again, rather than returning the candidate.
    return content.windows.first { $0.windowID == selected.windowID }
}

// Concrete composition of the buffer's selection branch; nil selection is
// intentionally retained for the subsequent display/filter plan to interpret.
public func selectScreenshotWindow(in content: SCShareableContent,
    includedWindowIDs: [UInt32]?, appName: String?
) -> SCWindow? {
    selectScreenshotWindow(includedWindowIDs: includedWindowIDs, appName: appName,
        windows: { content.windows }, windowID: { $0.windowID },
        matchingApp: { screenshotWindow(matching: $0, in: content) })
}

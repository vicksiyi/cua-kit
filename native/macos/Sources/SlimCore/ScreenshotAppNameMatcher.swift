import Foundation

// ScreenshotImplementation matcher 0x100fb723c..0x100fb7638.
// Preserve separate passes: an earlier prefix must not beat a later exact name.
public func matchingScreenshotAppWindow<Window>(in windows: [Window], appName: String,
    applicationName: (Window) -> String?
) -> Window? {
    let requested = appName.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
    for window in windows {
        guard let name = applicationName(window) else { continue }
        if name.lowercased().trimmingCharacters(in: .whitespacesAndNewlines) == requested {
            return window
        }
    }
    for window in windows {
        guard let name = applicationName(window) else { continue }
        if requested.hasPrefix(name.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)) {
            return window
        }
    }
    guard requested.count >= 4 else { return nil }
    for window in windows {
        guard let name = applicationName(window) else { continue }
        // The third pass lowercases the candidate without trimming it.
        if name.lowercased().contains(requested) { return window }
    }
    return nil
}

// Buffer window-selection branch0x100fb8340..0x100fb84bc. Exactly one explicit
// ID selects a matching window; multiple IDs leave single-window selection nil.
// App-name matching is only for nil/empty IDs, never fallback for missing ID.
func selectScreenshotWindow<Window>(includedWindowIDs: [UInt32]?, appName: String?,
    windows: () -> [Window], windowID: (Window) -> UInt32,
    matchingApp: (String) -> Window?
) -> Window? {
    if let includedWindowIDs, !includedWindowIDs.isEmpty {
        guard includedWindowIDs.count == 1 else { return nil }
        return windows().first { windowID($0) == includedWindowIDs[0] }
    }
    guard let appName else { return nil }
    return matchingApp(appName)
}

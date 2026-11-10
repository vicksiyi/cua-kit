enum ScreenshotContentScope: Equatable {
    case currentProcess
    case onScreenExcludingDesktop
    case all
}

// Shareable-content branchfb4a94..fb5198. Current-process API is gated on
// macOS14.4; its old-OS path requests all content. Normal mode optimizes to
// onscreen only when no explicit IDs or every requested ID is currently visible.
func screenshotContentScope(currentProcessOnly: Bool, supportsCurrentProcess: Bool,
    includedWindowIDs: [UInt32]?, visibleWindowIDs: () -> [UInt32]
) -> ScreenshotContentScope {
    if currentProcessOnly { return supportsCurrentProcess ? .currentProcess : .all }
    guard let includedWindowIDs else { return .onScreenExcludingDesktop }
    let visible = visibleWindowIDs()
    return includedWindowIDs.allSatisfy { visible.contains($0) } ? .onScreenExcludingDesktop : .all
}

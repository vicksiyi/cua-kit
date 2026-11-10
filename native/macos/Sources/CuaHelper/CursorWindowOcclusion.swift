// Native windowDidChangeOcclusionState body 0x10009ac00. The Style hook
// runs on every exit, including paths which do not reorder the window.
func updateCursorWindowOcclusion(
    isVisible: () -> Bool, occlusionState: () -> UInt,
    reasons: () -> CursorOverlayWindowLevelReasons,
    correspondingWindowID: () -> UInt32?, windowNumbers: () -> [Int]?,
    windowNumber: () -> Int, restoreAssociation: (UInt32) -> Void,
    updateVisibility: () -> Void, styleVisibilityDidChange: () -> Void
) {
    defer { styleVisibilityDidChange() }
    guard isVisible(), occlusionState() != 2 else { return }
    let overlay = reasons()
    guard !overlay.appMonitor && !overlay.petLaunch,
          let id = correspondingWindowID(), let numbers = windowNumbers(),
          let ownIndex = numbers.firstIndex(where: { $0 == windowNumber() }),
          let targetIndex = numbers.firstIndex(of: Int(id)), ownIndex >= targetIndex else { return }
    restoreAssociation(id)
    updateVisibility()
}

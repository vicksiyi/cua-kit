// Extracted AX-action focus preparation from 0x1007b1284..<0x1007b16bc
// and its WebView continuation 0x1007b18b4..<0x1007b1cd8. Cursor.press,
// action routing and actual focus-enforcer state ownership remain separate.
func prepareUIElementAccessibilityActionFocus(
    hasFocusEnforcer: Bool,
    applicationBelievesItHasFocus: () -> Bool,
    isCatalystApp: () -> Bool,
    clickingMayCauseSelection: () -> Bool,
    role: () -> UIElementRole?,
    probeApplicationIsActive: () throws -> Void,
    safelyEnforceWindowActiveState: () async throws -> Void
) async throws {
    if !hasFocusEnforcer {
        // Original reads AX PID, resolves NSRunningApplication and queries
        // isActive if present. It discards that Bool; it does NOT activate.
        try probeApplicationIsActive()
        return
    }
    if applicationBelievesItHasFocus() { return }
    guard isCatalystApp() else { return }
    if clickingMayCauseSelection() || role() == .menuButton {
        try await safelyEnforceWindowActiveState()
    }
}

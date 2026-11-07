// Extracted orchestration from ApplicationUIElement.
// syntheticallyActivateIfNeededForSendingClick, 0x1006fc140..0x1006fc708.
// Window boxing, actual enforcer state/activation, and the Catalyst role set
// remain supplied dependencies; this is not an NSRunningApplication.activate fallback.
func prepareApplicationForSyntheticClick(
    hasFocusEnforcer: Bool,
    applicationBelievesItHasFocus: () -> Bool,
    hasHeldKey: Bool,
    clickingByCoordinate: Bool,
    isInsideWebView: Bool,
    clickingMayCauseSelection: () -> Bool,
    isCatalystApp: () -> Bool,
    catalystRoleRequiresActivation: () -> Bool,
    applicationIsActive: () throws -> Bool,
    safelyEnforceWindowActiveState: () async throws -> Void
) async throws -> Bool {
    guard hasFocusEnforcer else { return try applicationIsActive() }
    if applicationBelievesItHasFocus() { return true }
    if hasHeldKey {
        try await safelyEnforceWindowActiveState()
        return true
    }
    if clickingByCoordinate && (isInsideWebView || clickingMayCauseSelection()) {
        try await safelyEnforceWindowActiveState()
        return true
    }
    if isCatalystApp() && (clickingMayCauseSelection() || catalystRoleRequiresActivation()) {
        try await safelyEnforceWindowActiveState()
        return true
    }
    return false
}

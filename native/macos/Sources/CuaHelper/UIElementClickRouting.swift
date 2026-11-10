// Continuation after prepareUIElementClick. AX eligibility was decided from
// the first web-view read, but source 0x1007b11b8 deliberately reads it again.
// Caller owns window/app/focus/cursor contexts and the final event targeting.
@MainActor
func executePreparedUIElementClick<Result>(
    _ preparation: UIElementClickPreparation,
    isInsideWebView: () -> Bool,
    webClickHitsTarget: () async -> Bool,
    virtualCursor: (any VirtualCursor)?,
    prepareActionFocus: () async throws -> Void,
    performAction: (UIElementAction) throws -> Result,
    simulateClick: (_ initiallyInsideWebView: Bool) async throws -> Result
) async throws -> Result {
    guard preparation.useAccessibilityAction, let action = preparation.action else {
        return try await simulateClick(preparation.initiallyInsideWebView)
    }
    if isInsideWebView(), await webClickHitsTarget() {
        return try await simulateClick(preparation.initiallyInsideWebView)
    }
    try await virtualCursor?.press()
    try await prepareActionFocus()
    return try performAction(action)
}

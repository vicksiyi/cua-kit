// Continuation after prepareUIElementClick. AX eligibility was decided from
// the first web-view read, but source 0x1007b11b8 deliberately reads it again.
// Caller owns window/app/focus/cursor contexts and the final event targeting.
func executePreparedUIElementClick<Result>(
    _ preparation: UIElementClickPreparation,
    isolation: isolated (any Actor)? = #isolation,
    isInsideWebView: () -> Bool,
    webClickHitsTarget: () async -> Bool,
    cursorPress: (() async throws -> Void)?,
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
    if let cursorPress { try await cursorPress() }
    try await prepareActionFocus()
    return try performAction(action)
}

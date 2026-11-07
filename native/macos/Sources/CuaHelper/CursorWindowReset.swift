import CoreGraphics

// Outer cursor Window reset at 0x10009b30c. Named reason0/reason1 until
// source field names are recovered; only reason1 is cleared by this operation.
func resetCursorWindow(
    overlayReasons: () -> (Bool, Bool), clearTemporaryOverlayReason: () -> Void,
    setLevel: (Int) -> Void, resetMotionAnimations: () -> Void,
    resetScootAnimations: () -> Void, clearNextInteractionHandler: () -> Void,
    clearMotionCompletionHandler: () -> Void, clearTimingSatisfied: () -> Void,
    setVelocityX: (CGFloat) -> Void, setVelocityY: (CGFloat) -> Void,
    wantsToBeVisible: () -> Bool, correspondingWindowIsPresent: () -> Bool,
    updateVisibility: () -> Void
) {
    let reasons = overlayReasons()
    clearTemporaryOverlayReason()
    if !reasons.0 && reasons.1 { setLevel(0) }
    resetMotionAnimations()
    resetScootAnimations()
    clearNextInteractionHandler()
    clearMotionCompletionHandler()
    clearTimingSatisfied()
    setVelocityX(0)
    setVelocityY(0)
    if reasons.1 && wantsToBeVisible() && correspondingWindowIsPresent() {
        updateVisibility()
    }
}

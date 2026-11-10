extension ComputerUseCursorWindow {
    // Native progress-animation finished branch 0x100097c48..0x100097d74.
    // Keep callback reentrancy: clear the live slots after interaction callback,
    // capture the then-current completion, clear it before any visibility work.
    func finishProgressMotion() {
        cursorMotionNextInteractionTimingHandler?()
        cursorMotionProgressAnimation = nil
        cursorMotionNextInteractionTimingHandler = nil
        let completion = cursorMotionCompletionHandler
        cursorMotionCompletionHandler = nil
        cursorMotionDidSatisfyNextInteractionTiming = false
        clearTemporaryMoveOverlay()
        style.velocityX = 0
        style.velocityY = 0
        completion?()
    }
}

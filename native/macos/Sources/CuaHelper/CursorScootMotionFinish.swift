import AppKit

extension ComputerUseCursorWindow {
    // Native finished branch0x10009771c..0x1000978dc. Unlike progress
    // completion, scoot snaps the exact target and resets auxiliary springs.
    func finishScootMotion(target: CGPoint, correspondingWindowFrame: CGRect?,
        zeroScreenFrame: () -> CGRect? = {
            NSScreen.screens.first { $0.frame.contains(CGPoint.zero) }?.frame
        }
    ) {
        cursorMotionNextInteractionTimingHandler?()
        cursorScootPositionAnimation = nil
        cursorMotionNextInteractionTimingHandler = nil
        let completion = cursorMotionCompletionHandler
        cursorMotionCompletionHandler = nil
        cursorMotionDidSatisfyNextInteractionTiming = false
        currentInterpolatedOrigin = target
        var absolute = target
        if let frame = correspondingWindowFrame {
            absolute.x += frame.origin.x
            absolute.y += (zeroScreenFrame()?.maxY ?? 0) - (frame.origin.y + frame.size.height)
        }
        setFrameOrigin(CGPoint(x: absolute.x.rounded(.toNearestOrAwayFromZero),
            y: absolute.y.rounded(.toNearestOrAwayFromZero)))
        clearTemporaryMoveOverlay()
        resetScootAnimations()
        style.velocityX = 0
        style.velocityY = 0
        completion?()
    }
}

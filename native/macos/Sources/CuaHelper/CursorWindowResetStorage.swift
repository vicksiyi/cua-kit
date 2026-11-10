import CoreGraphics

// Native descriptor 0x1012be2cc, field record 0x101316558.
struct CursorOverlayWindowLevelReasons {
    var appMonitor = false
    var petLaunch = false
}

// Live fields of Cursor.Window, not a parallel model or animation registry.
@MainActor
protocol CursorWindowResetStorage: CursorScootStyleResetStorage {
    var overlayWindowLevelReasons: CursorOverlayWindowLevelReasons { get set }
    var cursorMotionNextInteractionTimingHandler: (() -> Void)? { get set }
    var cursorMotionCompletionHandler: (() -> Void)? { get set }
    var cursorMotionDidSatisfyNextInteractionTiming: Bool { get set }
    var wantsToBeVisible: Bool { get }
    var correspondingWindowID: UInt32? { get }
    func setCursorWindowLevel(_ level: Int)
    func correspondingWindowIsPresent() -> Bool
    func updateVisibility()
}

@MainActor
extension CursorWindowResetStorage {
    func resetCursorWindowState() {
        resetCursorWindow(
            overlayReasons: { (self.overlayWindowLevelReasons.appMonitor, self.overlayWindowLevelReasons.petLaunch) },
            clearTemporaryOverlayReason: { self.overlayWindowLevelReasons.petLaunch = false },
            setLevel: { self.setCursorWindowLevel($0) },
            resetMotionAnimations: { self.resetMotionAnimations() },
            resetScootAnimations: { self.resetScootAnimations() },
            clearNextInteractionHandler: { self.cursorMotionNextInteractionTimingHandler = nil },
            clearMotionCompletionHandler: { self.cursorMotionCompletionHandler = nil },
            clearTimingSatisfied: { self.cursorMotionDidSatisfyNextInteractionTiming = false },
            setVelocityX: { self.style.velocityX = $0 },
            setVelocityY: { self.style.velocityY = $0 },
            wantsToBeVisible: { self.wantsToBeVisible },
            correspondingWindowIsPresent: { self.correspondingWindowIsPresent() },
            updateVisibility: { self.updateVisibility() })
    }
}

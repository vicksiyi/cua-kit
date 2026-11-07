import Animation

// Motion-animation phase of Window reset 0x10009b364..0x10009b468.
// Position is deliberately re-read after clearing its update callback because
// releasing that callback can change the owner's stored animation.
func resetCursorMotionAnimations<Progress, Position>(
    progress: () -> Progress?, progressState: (Progress) -> AnimationState,
    stopProgressImmediately: (Progress) -> Void, clearProgress: () -> Void,
    position: () -> Position?, clearPositionCallback: (Position) -> Void,
    positionState: (Position) -> AnimationState,
    stopPositionImmediately: (Position) -> Void, clearPosition: () -> Void
) {
    if let animation = progress(), progressState(animation) != .ended {
        stopProgressImmediately(animation)
    }
    clearProgress()
    let hadPosition = { () -> Bool in
        guard let animation = position() else { return false }
        clearPositionCallback(animation)
        return true
    }()
    if hadPosition, let current = position(), positionState(current) != .ended {
        stopPositionImmediately(current)
    }
    clearPosition()
}

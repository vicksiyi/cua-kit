import AppKit

// Native post-window-move gate0x100092a5c..a78. A started motion restores
// its own appearance; only the nonanimated first-show path awaits fadeIn.
func cursorMoveRequiresFadeIn(started: Bool, animated: Bool, fadeIn: Bool, wasVisible: Bool) -> Bool {
    !started && (animated || fadeIn) && !wasVisible
}

extension ComputerUseCursor {
    // Native public owner.move0x100091f24. Finishing this method means the
    // requested interaction threshold was reached, not necessarily motion end.
    func move(to point: CGPoint, aboveWindowID: UInt32?, relativeToWindow: Bool,
        nextInteractionTiming: CursorNextInteractionTiming, animated: Bool,
        fadeIn: Bool, isDelegate: Bool, environment: CursorWindowMoveEnvironment? = nil
    ) async {
        await prepareMoveOwnership(to: point, aboveWindowID: aboveWindowID,
            relativeToWindow: relativeToWindow, animated: animated, isDelegate: isDelegate)
        let wasVisible = prepareMoveAppearance(animated: animated, fadeIn: fadeIn)
        let started = await moveWindowAndWaitForInteraction(to: point, aboveWindowID: aboveWindowID,
            relativeToWindow: relativeToWindow, animated: animated, timing: nextInteractionTiming,
            isDelegate: isDelegate, environment: environment)
        if cursorMoveRequiresFadeIn(started: started, animated: animated, fadeIn: fadeIn,
            wasVisible: wasVisible) {
            // Reload current owner window after the await, matching0x100092af0.
            await window.fadeIn()
        }
        NotificationCenter.default.post(name: computerUseCursorDidFinishMoveNotification, object: self)
    }
}

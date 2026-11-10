import AppKit

extension ComputerUseCursor {
    // Native continuation body0x100092c48. This is the window-move await
    // stage only; delegate/appearance/fade phases surround it in owner.move.
    func moveWindowAndWaitForInteraction(to point: CGPoint, aboveWindowID: UInt32?,
        relativeToWindow: Bool, animated: Bool,
        timing: CursorNextInteractionTiming, isDelegate: Bool,
        environment: CursorWindowMoveEnvironment? = nil
    ) async -> Bool {
        var started = false
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            let callbacks = CursorMoveCompletion(cursor: self, isDelegate: isDelegate,
                resume: { continuation.resume() })
            let capturedWindow = window
            started = capturedWindow.move(to: point, aboveWindowID: aboveWindowID,
                relativeToWindow: relativeToWindow, animated: animated, timing: timing,
                interaction: { callbacks.interactionReady() },
                completion: { callbacks.movementCompleted() }, environment: environment)
        }
        return started
    }
}

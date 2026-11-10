import Animation
import AppKit
import Darwin

extension ComputerUseCursorWindow {
    // Native0x100096938 shared entry. Outer move has already prepared
    // relative origins, corresponding window and visibility ownership.
    func startCursorMotion(start: CGPoint, target: CGPoint, initialWindowFrame: CGRect?,
        timing: ComputerUseCursor.CursorNextInteractionTiming,
        correspondingWindowFrame: @escaping () -> CGRect?,
        interaction: (() -> Void)?, completion: (() -> Void)?,
        screenFrames: () -> [CGRect] = { NSScreen.screens.map { $0.frame } },
        zeroScreenFrame: () -> CGRect? = {
            NSScreen.screens.first { $0.frame.contains(CGPoint.zero) }?.frame
        },
        afterMove: ((CGPoint) -> Void)? = nil,
        enqueueScalar: @escaping @MainActor (SpringAnimation<CGFloat>, ComputerUseCursorWindow) -> Void = {
            $0.start(afterDelay: .zero, drivenBy: $1)
        },
        enqueuePosition: @MainActor (SpringAnimation<CGPoint>, ComputerUseCursorWindow) -> Void = {
            $0.start(afterDelay: .zero, drivenBy: $1)
        }
    ) {
        let bounds = cursorPathBounds(start: start, target: target, correspondingWindowFrame: initialWindowFrame,
            screenFrames: screenFrames, zeroScreenFrame: zeroScreenFrame)
        let threshold = motionConfiguration.scootDistanceThreshold
        let distance = hypot(target.x - start.x, target.y - start.y)
        if distance <= threshold {
            startScootMotion(start: start, target: target, timing: timing,
                correspondingWindowFrame: correspondingWindowFrame,
                interaction: interaction, completion: completion, afterMove: afterMove,
                enqueueAuxiliary: enqueueScalar, enqueuePosition: enqueuePosition)
        } else {
            startPathProgressMotion(start: start, target: target, bounds: bounds, updatesAngle: true,
                timing: timing, correspondingWindowFrame: correspondingWindowFrame,
                interaction: interaction, completion: completion, afterMove: afterMove, enqueue: enqueueScalar)
        }
    }
}

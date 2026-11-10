import Animation
import CoreGraphics

extension ComputerUseCursorWindow {
    // Native 0x100096eb4..0x100096f90. Separate CGPoint spring and
    // configuration from the scalar progress spring used for longer moves.
    func prepareScootPositionAnimation(start: CGPoint, target: CGPoint,
        timing: ComputerUseCursor.CursorNextInteractionTiming,
        interaction: (() -> Void)?, completion: (() -> Void)?
    ) -> SpringAnimation<CGPoint> {
        let animation = SpringAnimation<CGPoint>(
            SpringParameters(response: motionConfiguration.scootPositionResponse,
                dampingFraction: motionConfiguration.scootPositionDampingFraction),
            initialValue: start, targetValue: target,
            idleVelocityThreshold: Double(motionConfiguration.scootPositionSettleVelocity))
        cursorScootPositionAnimation = animation
        cursorMotionNextInteractionTimingHandler = interaction
        cursorMotionCompletionHandler = completion
        cursorMotionDidSatisfyNextInteractionTiming = timing == .finished
        return animation
    }
}

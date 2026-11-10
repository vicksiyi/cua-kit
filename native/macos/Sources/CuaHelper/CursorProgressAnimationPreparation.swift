import Animation
import CoreGraphics

extension ComputerUseCursorWindow {
    // Native storage stage 0x100096a98..0x100096b90. Response is supplied
    // by the native path-complexity calculation, not guessed here.
    func prepareProgressAnimation(response: Double,
        timing: ComputerUseCursor.CursorNextInteractionTiming,
        interaction: (() -> Void)?, completion: (() -> Void)?
    ) -> SpringAnimation<CGFloat> {
        let animation = SpringAnimation<CGFloat>(
            SpringParameters(response: response, dampingFraction: motionConfiguration.springDampingFraction),
            initialValue: 0, targetValue: 1, idleVelocityThreshold: 0.01)
        cursorMotionProgressAnimation = animation
        cursorMotionNextInteractionTimingHandler = interaction
        cursorMotionCompletionHandler = completion
        cursorMotionDidSatisfyNextInteractionTiming = timing == .finished
        return animation
    }
}

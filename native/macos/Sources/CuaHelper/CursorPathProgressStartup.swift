import Animation
import AppKit

extension ComputerUseCursorWindow {
    // Long-movement branch 0x1000969d8..0x100096d08, followed by the
    // shared start tail. Outer move still selects bounds/scoot and ownership.
    @discardableResult
    func startPathProgressMotion(start: CGPoint, target: CGPoint, bounds: CGRect,
        updatesAngle: Bool, timing: ComputerUseCursor.CursorNextInteractionTiming,
        correspondingWindowFrame: @escaping () -> CGRect?,
        interaction: (() -> Void)?, completion: (() -> Void)?,
        afterMove: ((CGPoint) -> Void)? = nil,
        enqueue: @MainActor (SpringAnimation<CGFloat>, ComputerUseCursorWindow) -> Void = {
            $0.start(afterDelay: .zero, drivenBy: $1)
        }
    ) -> SpringAnimation<CGFloat> {
        let path = planCursorPath(start: start, target: target, bounds: bounds,
            configuration: motionConfiguration)
        let metrics = cursorPathMetrics(path, bounds: bounds, configuration: motionConfiguration)
        prepareInitialMotionAngle(path: path, updatesAngle: updatesAngle)
        let response = cursorSpringResponse(path: path, metrics: metrics, configuration: motionConfiguration)
        let animation = prepareProgressAnimation(response: response, timing: timing,
            interaction: interaction, completion: completion)
        bindProgressEvents(animation, path: path, updatesAngle: updatesAngle,
            correspondingWindowFrame: correspondingWindowFrame, afterMove: afterMove)
        enqueue(animation, self)
        return animation
    }
}

import Animation
import AppKit

extension ComputerUseCursorWindow {
    // Native short branch0x100096d0c..0x1000970e8. The outer move
    // chooses this branch and prepares visibility/relative origin first.
    @discardableResult
    func startScootMotion(start: CGPoint, target: CGPoint,
        timing: ComputerUseCursor.CursorNextInteractionTiming,
        correspondingWindowFrame: @escaping () -> CGRect?,
        interaction: (() -> Void)?, completion: (() -> Void)?,
        afterMove: ((CGPoint) -> Void)? = nil,
        enqueueAuxiliary: @escaping @MainActor (SpringAnimation<CGFloat>, ComputerUseCursorWindow) -> Void = {
            $0.start(afterDelay: .zero, drivenBy: $1)
        },
        enqueuePosition: @MainActor (SpringAnimation<CGPoint>, ComputerUseCursorWindow) -> Void = {
            $0.start(afterDelay: .zero, drivenBy: $1)
        }
    ) -> SpringAnimation<CGPoint> {
        let geometry = prepareScootGeometry(start: start, target: target)
        let animation = prepareScootPositionAnimation(start: start, target: target, timing: timing,
            interaction: interaction, completion: completion)
        bindScootEvents(animation, start: start, target: target, direction: geometry.direction,
            correspondingWindowFrame: correspondingWindowFrame, afterMove: afterMove,
            enqueueAuxiliary: enqueueAuxiliary)
        updateScootBaseRotation(degrees: 0, enqueue: enqueueAuxiliary)
        let axis = cursorScootAxisGeometry(direction: geometry.direction, configuration: motionConfiguration)
        updateScootAxis(degrees: axis.degrees, enqueue: enqueueAuxiliary)
        enqueuePosition(animation, self)
        return animation
    }
}

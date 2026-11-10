import Animation
import AppKit

extension ComputerUseCursorWindow {
    // Native paired degree-spring helpers0x100099570/0x100099804.
    @discardableResult
    func updateScootBaseRotation(degrees: CGFloat,
        enqueue: @MainActor (SpringAnimation<CGFloat>, ComputerUseCursorWindow) -> Void = {
            $0.start(afterDelay: .zero, drivenBy: $1)
        }
    ) -> SpringAnimation<CGFloat> {
        let current = cursorScootBaseRotationOffset
        var delta = degrees - current
        while delta > 180 { delta += -360 }
        while delta < -180 { delta += 360 }
        let target = current + delta
        if let existing = cursorScootBaseRotationAnimation, existing.state != .ended {
            existing.targetValue = target
            return existing
        }
        let animation = SpringAnimation<CGFloat>(SpringParameters(
            response: motionConfiguration.scootBaseRotationResponse,
            dampingFraction: motionConfiguration.scootBaseRotationDampingFraction),
            initialValue: current, targetValue: target, idleVelocityThreshold: 0.01)
        cursorScootBaseRotationAnimation = animation
        animation.eventHandler = { [weak self, weak animation] event in
            guard let self, let animation, self.cursorScootBaseRotationAnimation === animation else { return }
            let value: CGFloat
            switch event {
            case .valueChanged(_, let newValue): value = newValue
            case .finished(let finalValue): value = finalValue
            case .retargeted: return
            }
            self.cursorScootBaseRotationOffset = value
            self.refreshScootOrientation()
        }
        enqueue(animation, self)
        return animation
    }
}

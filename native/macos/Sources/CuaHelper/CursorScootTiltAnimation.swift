import Animation
import AppKit

extension ComputerUseCursorWindow {
    // Native0x100099f70..0x10009a27c. Degree-valued offset, no extra clamp.
    @discardableResult
    func updateScootTilt(degrees: CGFloat,
        enqueue: @MainActor (SpringAnimation<CGFloat>, ComputerUseCursorWindow) -> Void = {
            $0.start(afterDelay: .zero, drivenBy: $1)
        }
    ) -> SpringAnimation<CGFloat> {
        if let existing = cursorScootRotationAnimation, existing.state != .ended {
            existing.targetValue = degrees
            return existing
        }
        let animation = SpringAnimation<CGFloat>(SpringParameters(
            response: motionConfiguration.scootRotationResponse,
            dampingFraction: motionConfiguration.scootRotationDampingFraction),
            initialValue: cursorScootRotationOffset, targetValue: degrees, idleVelocityThreshold: 0.01)
        cursorScootRotationAnimation = animation
        animation.eventHandler = { [weak self, weak animation] event in
            guard let self, let animation, self.cursorScootRotationAnimation === animation else { return }
            let value: CGFloat
            switch event {
            case .valueChanged(_, let newValue): value = newValue
            case .finished(let finalValue): value = finalValue
            case .retargeted: return
            }
            self.cursorScootRotationOffset = value
            self.refreshScootOrientation()
        }
        enqueue(animation, self)
        return animation
    }
}

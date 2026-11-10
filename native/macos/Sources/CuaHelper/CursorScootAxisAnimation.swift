import Animation
import AppKit

extension ComputerUseCursorWindow {
    // Native paired degree-spring helpers0x100099570/0x100099804.
    @discardableResult
    func updateScootAxis(degrees: CGFloat,
        enqueue: @MainActor (SpringAnimation<CGFloat>, ComputerUseCursorWindow) -> Void = {
            $0.start(afterDelay: .zero, drivenBy: $1)
        }
    ) -> SpringAnimation<CGFloat> {
        let current = cursorScootAxisRotation
        var delta = degrees - current
        while delta > 180 { delta += -360 }
        while delta < -180 { delta += 360 }
        let target = current + delta
        if let existing = cursorScootAxisAnimation, existing.state != .ended {
            existing.targetValue = target
            return existing
        }
        let animation = SpringAnimation<CGFloat>(SpringParameters(
            response: motionConfiguration.scootAxisResponse,
            dampingFraction: motionConfiguration.scootAxisDampingFraction),
            initialValue: current, targetValue: target, idleVelocityThreshold: 0.01)
        cursorScootAxisAnimation = animation
        animation.eventHandler = { [weak self, weak animation] event in
            guard let self, let animation, self.cursorScootAxisAnimation === animation else { return }
            let value: CGFloat
            switch event {
            case .valueChanged(_, let newValue): value = newValue
            case .finished(let finalValue): value = finalValue
            case .retargeted: return
            }
            self.cursorScootAxisRotation = value
            self.style.scootStretchAngle = .radians(Double(value * 0.017453292519943295))
        }
        enqueue(animation, self)
        return animation
    }
}

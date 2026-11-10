import Animation
import AppKit

extension ComputerUseCursorWindow {
    // Native 0x100099bb4..0x100099f6c.
    @discardableResult
    func updateScootStretch(scale: CGFloat, xScale: CGFloat, pivotX: CGFloat,
        enqueue: @MainActor (SpringAnimation<CGFloat>, ComputerUseCursorWindow) -> Void = {
            $0.start(afterDelay: .zero, drivenBy: $1)
        }
    ) -> SpringAnimation<CGFloat> {
        style.scootStretchXScale = xScale
        cursorScootStretchXScale = xScale
        style.scootStretchPivotX = pivotX
        cursorScootStretchPivotX = pivotX
        if let existing = cursorScootStretchAnimation, existing.state != .ended {
            existing.targetValue = scale
            return existing
        }
        let animation = SpringAnimation<CGFloat>(SpringParameters(
            response: motionConfiguration.scootStretchResponse,
            dampingFraction: motionConfiguration.scootStretchDampingFraction),
            initialValue: cursorScootStretchScale, targetValue: scale, idleVelocityThreshold: 0.01)
        cursorScootStretchAnimation = animation
        animation.eventHandler = { [weak self, weak animation] event in
            guard let self, let animation, self.cursorScootStretchAnimation === animation else { return }
            let value: CGFloat
            switch event {
            case .valueChanged(_, let newValue): value = newValue
            case .finished(let finalValue): value = finalValue
            case .retargeted: return
            }
            let minimum = self.motionConfiguration.scootStretchMin
            let lower = value <= minimum ? minimum : value
            let bounded: CGFloat = lower > 1 ? 1 : lower
            self.cursorScootStretchScale = bounded
            self.style.scootStretchScale = bounded
        }
        enqueue(animation, self)
        return animation
    }
}

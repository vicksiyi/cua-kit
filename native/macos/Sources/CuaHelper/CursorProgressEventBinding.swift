import Animation
import CoreGraphics

extension ComputerUseCursorWindow {
    // Native 0x10009721c gates events by two weak references and identity
    // against the live animation slot. Replaced animations cannot move the UI.
    func bindProgressEvents(_ animation: SpringAnimation<CGFloat>, path: CursorCubicPath,
        updatesAngle: Bool, correspondingWindowFrame: @escaping () -> CGRect?,
        afterMove: ((CGPoint) -> Void)? = nil
    ) {
        animation.eventHandler = { [weak self, weak animation] event in
            guard let self, let animation,
                  self.cursorMotionProgressAnimation === animation else { return }
            let progress: CGFloat
            let finished: Bool
            switch event {
            case .valueChanged(_, let value): progress = value; finished = false
            case .finished(let value): progress = value; finished = true
            case .retargeted: return
            }
            self.applyProgressMotionFrame(path: path, progress: progress, finished: finished,
                updatesAngle: updatesAngle, correspondingWindowFrame: correspondingWindowFrame,
                progressVelocity: { CGFloat(animation.velocity[0]) }, afterMove: afterMove)
        }
    }
}
